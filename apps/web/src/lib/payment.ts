// The patient's payment, through the `payment` edge function (it holds Stripe's key).

const PAYMENT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payment`;

/**
 * Starts a payment (answers with Stripe's page), or, with a session, confirms one. A refusal the
 * patient can act on comes back as {error}: TIME_TAKEN when an unpaid booking's time was given away.
 * Null when the function could not be reached.
 */
export async function payment(body: { token: string; session_id?: string }): Promise<{ url?: string; paid?: boolean; error?: string } | null> {
  try {
    const response = await fetch(PAYMENT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.ok || response.status === 409 ? await response.json() : null;
  } catch {
    return null;
  }
}
