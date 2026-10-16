// A consultation's fee: typed in euros by the practitioner, stored in cents (fee_cents).
import { z } from "zod";

const amount = (fee: string) => Number(fee.replace(",", "."));

/** Empty for a free consultation, else 0.50 to 1000 euros with at most two decimals. */
export const feeSchema = z.string().trim().refine(
  (fee) => fee === "" || (/^\d{1,4}([.,]\d{1,2})?$/.test(fee) && amount(fee) >= 0.5 && amount(fee) <= 1000),
  "Enter an amount between 0.50 and 1000, for example 40 or 40.00, or leave it empty.",
);

export const toCents = (fee: string): number | null => (fee.trim() === "" ? null : Math.round(amount(fee.trim()) * 100));
export const fromCents = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
/** "€40.00". */
export const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;
