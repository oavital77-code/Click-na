import { z } from "zod";
import { toE164 } from "@/lib/phone";

/**
 * What PayPlus needs from a therapist to open a card-payments account under
 * Cleana+'s partnership: who the business is, where the money goes, and that
 * they accepted our payment terms. Shared by the form and the API, so messages
 * are catalogue keys translated on display (see translateIssue).
 */
export const BUSINESS_TYPES = ["exempt", "licensed", "company"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * An Israeli ID, dealer or company number: nine digits once the leading zeros
 * people drop are restored, with the standard check digit. Teudat zehut, osek
 * and ח.פ all use the same one, so a typo is caught here and not three days
 * later by PayPlus.
 */
export function isIsraeliIdNumber(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{5,9}$/.test(digits)) return false;
  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

const digits = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => new RegExp(`^\\d{${min},${max}}$`).test(v), "validation.bankInvalid");

export const paymentApplicationSchema = z.object({
  businessType: z.enum(BUSINESS_TYPES),
  /** The name on the dealer file or company register — what PayPlus contracts with. */
  legalName: z.string().trim().min(2, "validation.nameTooShort").max(120),
  idNumber: z
    .string()
    .trim()
    .refine(isIsraeliIdNumber, "validation.idNumberInvalid")
    .transform((v) => v.replace(/[\s-]/g, "").padStart(9, "0")),
  phone: z
    .string()
    .trim()
    .refine((v) => toE164(v) !== null, "validation.phoneInvalid")
    .transform((v) => toE164(v)!),
  email: z.string().trim().toLowerCase().email("validation.emailInvalid").max(255),
  street: z.string().trim().min(2, "validation.required").max(120),
  city: z.string().trim().min(2, "validation.required").max(60),
  bankCode: digits(2, 3),
  branchCode: digits(3, 3),
  accountNumber: digits(4, 13),
  accountHolder: z.string().trim().min(2, "validation.nameTooShort").max(120),
  /** Optional, and only a rough figure — PayPlus asks for it when pricing the account. */
  monthlyVolumeIls: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((v) => (v ? v.replace(/[^\d]/g, "") : ""))
    .refine((v) => v === "" || Number(v) < 100_000_000, "validation.required"),
  acceptTerms: z.literal(true, { message: "validation.termsRequired" }),
});

export type PaymentApplicationInput = z.input<typeof paymentApplicationSchema>;
export type PaymentApplicationDetails = Omit<z.output<typeof paymentApplicationSchema>, "acceptTerms">;

/** For the owner screen: the account number with all but its last four digits hidden. */
export function maskAccount(account: string): string {
  return account.length <= 4 ? account : `${"•".repeat(account.length - 4)}${account.slice(-4)}`;
}
