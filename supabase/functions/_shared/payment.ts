// Patient payment with Stripe Checkout (decision 0007), after Stripe's own guides:
// https://docs.stripe.com/checkout/quickstart and https://docs.stripe.com/checkout/fulfillment
import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

let client: Stripe | null = null;
/** Made on first use, so a missing key is a refused payment, not a crashed function. */
export function stripe(): Stripe {
  client ??= new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "missing", { httpClient: Stripe.createFetchHttpClient() });
  return client;
}

// The service key may read consultations and call record_payment; nothing reaches the browser.
export const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

/** Records a payment only after Stripe says this session is paid for this consultation. Safe to repeat. */
export async function fulfill(sessionId: string, consultationId?: string): Promise<boolean> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const id = session.client_reference_id;
  if (!id || (consultationId && id !== consultationId)) return false;
  if (session.payment_status !== "paid") return false;
  const { data } = await admin.rpc("record_payment", {
    p_consultation_id: id,
    p_session_id: session.id,
    p_amount_cents: session.amount_total,
  });
  return Boolean(data?.ok);
}
