import { describe, expect, it } from "vitest";
import { isIsraeliIdNumber, maskAccount, paymentApplicationSchema } from "./payment-application-schema";

const valid = {
  businessType: "exempt",
  legalName: "Or Avital",
  idNumber: "123456782",
  phone: "050-123-4567",
  email: "Or@Example.com ",
  street: "Herzl 1",
  city: "Tel Aviv",
  bankCode: "12",
  branchCode: "600",
  accountNumber: "123-456",
  accountHolder: "Or Avital",
  monthlyVolumeIls: "8,000",
  acceptTerms: true,
};

describe("isIsraeliIdNumber", () => {
  it("accepts a correct check digit and restores dropped leading zeros", () => {
    expect(isIsraeliIdNumber("123456782")).toBe(true);
    expect(isIsraeliIdNumber("18")).toBe(false); // too short to be anything
    expect(isIsraeliIdNumber("000000018")).toBe(true);
    expect(isIsraeliIdNumber("12345-6782")).toBe(true);
  });
  it("rejects a typo", () => {
    expect(isIsraeliIdNumber("123456789")).toBe(false);
    expect(isIsraeliIdNumber("abc")).toBe(false);
  });
});

describe("paymentApplicationSchema", () => {
  it("normalises what people type", () => {
    const parsed = paymentApplicationSchema.parse(valid);
    expect(parsed).toMatchObject({
      phone: "+972501234567",
      email: "or@example.com",
      accountNumber: "123456",
      monthlyVolumeIls: "8000",
      idNumber: "123456782",
    });
  });

  it("requires the terms to be accepted", () => {
    const result = paymentApplicationSchema.safeParse({ ...valid, acceptTerms: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("validation.termsRequired");
  });

  it("names the field that is wrong", () => {
    const result = paymentApplicationSchema.safeParse({ ...valid, idNumber: "123456789", branchCode: "6" });
    const fields = result.error?.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["idNumber", "branchCode"]));
  });

  it("leaves the monthly figure optional", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.monthlyVolumeIls;
    expect(paymentApplicationSchema.parse(rest).monthlyVolumeIls).toBe("");
  });
});

describe("maskAccount", () => {
  it("keeps only the last four digits", () => {
    expect(maskAccount("123456789")).toBe("•••••6789");
    expect(maskAccount("123")).toBe("123");
  });
});
