import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// PayPlus itself is not called: approving runs the same verification as any
// add-on, stubbed here as in integrations.integration.test.ts.
const verifyCredentials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integration-verify", () => ({ verifyCredentials }));

const { approveApplication, getApplicationSummary, isOwner, listApplications, rejectApplication, submitApplication } =
  await import("@/lib/payment-applications");
const { getCredentials, pauseManagedPayments, resumeManagedPayments } = await import("@/lib/integrations");

const KEY = Buffer.alloc(32, 7).toString("base64");
const FORM = {
  businessType: "licensed",
  legalName: "Dana Cohen",
  idNumber: "123456782",
  phone: "0501234567",
  email: "dana@example.com",
  street: "Herzl 1",
  city: "Haifa",
  bankCode: "10",
  branchCode: "800",
  accountNumber: "12345678",
  accountHolder: "Dana Cohen",
  acceptTerms: true,
};
const TERMINAL = { apiKey: "k", secretKey: "s", paymentPageUid: "p" };

describe("payment applications (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "payment-applications@example.com",
        fullName: "Dana Cohen",
        slug: "payment-applications-test",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    verifyCredentials.mockResolvedValue({ ok: true, accountLabel: "Dana's terminal" });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await prisma.paymentApplication.deleteMany({ where: { therapistId } });
    await prisma.integration.deleteMany({ where: { therapistId } });
    await prisma.notification.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("knows the owner from OWNER_NOTIFICATION_EMAIL, and nobody when it is unset", () => {
    expect(isOwner("Me@Example.com", { OWNER_NOTIFICATION_EMAIL: "other@x.com, me@example.com" })).toBe(true);
    expect(isOwner("me@example.com", {})).toBe(false);
    expect(isOwner(null, { OWNER_NOTIFICATION_EMAIL: "me@example.com" })).toBe(false);
  });

  it("stores the details encrypted, with the terms and fee they accepted", async () => {
    const result = await submitApplication(therapistId, FORM, { ip: "203.0.113.5" });
    expect(result.ok).toBe(true);

    const row = await prisma.paymentApplication.findUniqueOrThrow({ where: { therapistId } });
    expect(row.status).toBe("pending");
    expect(row.details).not.toContain("123456782");
    expect(row.details).not.toContain("12345678");
    expect(Number(row.platformFeePct)).toBe(2.5);
    expect(row.termsAcceptedIp).toBe("203.0.113.5");

    // The therapist sees their own application without the ID or the full account.
    const summary = await getApplicationSummary(therapistId);
    expect(summary).toMatchObject({ status: "pending", legalName: "Dana Cohen", bankAccount: "10-800-••••5678" });

    // The owner sees everything PayPlus will ask for.
    const [owned] = (await listApplications()).filter((a) => a.therapistId === therapistId);
    expect(owned.details).toMatchObject({ idNumber: "123456782", accountNumber: "12345678", phone: "+972501234567" });
  });

  it("refuses an application without accepted terms, naming the field", async () => {
    const result = await submitApplication(therapistId, { ...FORM, acceptTerms: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.acceptTerms).toBeTruthy();
    expect(await prisma.paymentApplication.count({ where: { therapistId } })).toBe(0);
  });

  it("refuses to store details when there is no encryption key", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    expect((await submitApplication(therapistId, FORM)).ok).toBe(false);
    expect(await prisma.paymentApplication.count({ where: { therapistId } })).toBe(0);
  });

  it("approval wires the PayPlus terminal into the therapist's payplus add-on and tells them", async () => {
    await submitApplication(therapistId, FORM);
    const { id } = await prisma.paymentApplication.findUniqueOrThrow({ where: { therapistId } });

    expect(await approveApplication(id, TERMINAL)).toEqual({ ok: true });
    expect(verifyCredentials).toHaveBeenCalledWith("payplus", TERMINAL, expect.anything());
    expect(await getCredentials(therapistId, "payplus")).toEqual(TERMINAL);
    expect((await getApplicationSummary(therapistId))?.status).toBe("active");
    expect(await prisma.notification.count({ where: { therapistId, type: "payment_setup" } })).toBe(1);

    // A second application cannot reopen an account that is already on.
    expect((await submitApplication(therapistId, FORM)).ok).toBe(false);
  });

  it("a terminal PayPlus rejects leaves the application waiting", async () => {
    verifyCredentials.mockResolvedValue({ ok: false, error: "bad keys" });
    await submitApplication(therapistId, FORM);
    const { id } = await prisma.paymentApplication.findUniqueOrThrow({ where: { therapistId } });

    expect(await approveApplication(id, TERMINAL)).toMatchObject({ ok: false, error: "bad keys" });
    expect((await getApplicationSummary(therapistId))?.status).toBe("pending");
  });

  it("switching payments off and on keeps the terminal, which is ours to hold", async () => {
    await submitApplication(therapistId, FORM);
    const { id } = await prisma.paymentApplication.findUniqueOrThrow({ where: { therapistId } });
    await approveApplication(id, TERMINAL);

    await pauseManagedPayments(therapistId);
    expect(await getCredentials(therapistId, "payplus")).toBeNull();
    expect(await resumeManagedPayments(therapistId)).toBe(true);
    expect(await getCredentials(therapistId, "payplus")).toEqual(TERMINAL);
  });

  it("cannot switch on payments that were never opened", async () => {
    expect(await resumeManagedPayments(therapistId)).toBe(false);
  });

  it("a rejection carries its reason, and the therapist can send again", async () => {
    await submitApplication(therapistId, FORM);
    const { id } = await prisma.paymentApplication.findUniqueOrThrow({ where: { therapistId } });

    expect(await rejectApplication(id, "  The bank letter is missing  ")).toEqual({ ok: true });
    expect(await getApplicationSummary(therapistId)).toMatchObject({ status: "rejected", rejectionReason: "The bank letter is missing" });

    expect((await submitApplication(therapistId, { ...FORM, branchCode: "801" })).ok).toBe(true);
    expect(await getApplicationSummary(therapistId)).toMatchObject({ status: "pending", rejectionReason: null });
  });
});
