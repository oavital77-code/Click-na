import { afterAll, afterEach, describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTreatment, deleteTreatment, listTreatments, treatmentSchema } from "@/lib/treatments";

describe("treatments (against a live database)", () => {
  let therapistId: string;
  let otherId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.therapist.create({
        data: { email: "treatments-a@example.com", fullName: "A", slug: "treatments-a-test", subscription: { create: {} }, settings: { create: {} } },
      }),
      prisma.therapist.create({
        data: { email: "treatments-b@example.com", fullName: "B", slug: "treatments-b-test", subscription: { create: {} }, settings: { create: {} } },
      }),
    ]);
    therapistId = a.id;
    otherId = b.id;
  });

  afterEach(async () => {
    await prisma.treatmentTemplate.deleteMany({ where: { therapistId: { in: [therapistId, otherId] } } });
  });

  afterAll(async () => {
    for (const id of [therapistId, otherId]) {
      await prisma.therapistSettings.deleteMany({ where: { therapistId: id } });
      await prisma.subscription.deleteMany({ where: { therapistId: id } });
      await prisma.therapist.delete({ where: { id } });
    }
  });

  it("keeps the menu in the order it was written, as numbers", async () => {
    await createTreatment(therapistId, { name: "Regular", priceIls: 350 });
    await createTreatment(therapistId, { name: "Initial", priceIls: 200.5 });
    expect(await listTreatments(therapistId)).toMatchObject([
      { name: "Regular", priceIls: 350, sortOrder: 0 },
      { name: "Initial", priceIls: 200.5, sortOrder: 1 },
    ]);
  });

  it("is one therapist's menu: another's id removes nothing and sees nothing", async () => {
    const mine = await createTreatment(therapistId, { name: "Regular", priceIls: 350 });
    expect(await listTreatments(otherId)).toEqual([]);
    expect(await deleteTreatment(otherId, mine.id)).toBe(false);
    expect(await deleteTreatment(therapistId, mine.id)).toBe(true);
    expect(await listTreatments(therapistId)).toEqual([]);
  });

  it("rejects an empty name, a zero price and a fraction of an agora", () => {
    expect(treatmentSchema.safeParse({ name: " ", priceIls: 100 }).success).toBe(false);
    expect(treatmentSchema.safeParse({ name: "X", priceIls: 0 }).success).toBe(false);
    expect(treatmentSchema.safeParse({ name: "X", priceIls: 10.005 }).success).toBe(false);
    expect(treatmentSchema.safeParse({ name: "X", priceIls: 99.99 }).success).toBe(true);
  });
});
