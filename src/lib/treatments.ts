import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * The therapist's menu: named treatments with a price each. Picked from when
 * they ask a client to pay after a session. The list is theirs alone — a
 * template id from another therapist's menu names nothing here.
 */
export const treatmentSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(80),
  priceIls: z.number().min(1, "validation.priceInvalid").max(100000, "validation.priceInvalid").multipleOf(0.01),
});
export type TreatmentInput = z.infer<typeof treatmentSchema>;

export type Treatment = { id: string; name: string; priceIls: number; sortOrder: number };

function toTreatment(row: { id: string; name: string; priceIls: unknown; sortOrder: number }): Treatment {
  return { id: row.id, name: row.name, priceIls: Number(row.priceIls), sortOrder: row.sortOrder };
}

export async function listTreatments(therapistId: string): Promise<Treatment[]> {
  const rows = await prisma.treatmentTemplate.findMany({
    where: { therapistId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toTreatment);
}

export async function createTreatment(therapistId: string, input: TreatmentInput): Promise<Treatment> {
  const last = await prisma.treatmentTemplate.findFirst({
    where: { therapistId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await prisma.treatmentTemplate.create({
    data: { therapistId, name: input.name, priceIls: input.priceIls, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  return toTreatment(row);
}

/** Scoped to the therapist: someone else's id deletes nothing and says so. */
export async function deleteTreatment(therapistId: string, id: string): Promise<boolean> {
  const result = await prisma.treatmentTemplate.deleteMany({ where: { id, therapistId } });
  return result.count > 0;
}
