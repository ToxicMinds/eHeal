// The patient's page calls this with its link token: to start a payment, or, back from
// Stripe, to confirm it. The token is the only credential; it names one consultation.
import { fulfill, stripe } from "../_shared/payment.ts";
import { admin, reply, SITES } from "../_shared/server.ts";

const TOKEN = /^[0-9a-f]{64}$/;
const SESSION = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return reply(origin, 204, null);
  if (request.method !== "POST" || !origin || !SITES.includes(origin)) return reply(origin, 403, { error: "FORBIDDEN" });

  let input: { token?: unknown; session_id?: unknown };
  try {
    input = await request.json();
  } catch {
    return reply(origin, 400, { error: "VALIDATION" });
  }
  const token = typeof input.token === "string" && TOKEN.test(input.token) ? input.token : null;
  if (!token) return reply(origin, 400, { error: "VALIDATION" });

  const { data: consultation } = await admin.from("consultations")
    .select("id, fee_cents, paid_at, status, hold_until").eq("invite_token", token).maybeSingle();
  if (!consultation || consultation.status === "consent_withdrawn") return reply(origin, 404, { error: "NOT_FOUND" });

  try {
    if (input.session_id !== undefined) {
      // Back from Stripe: fulfil here as well as in the webhook, as Stripe recommends.
      if (typeof input.session_id !== "string" || !SESSION.test(input.session_id)) return reply(origin, 400, { error: "VALIDATION" });
      return reply(origin, 200, { paid: await fulfill(input.session_id, consultation.id) });
    }
    if (consultation.fee_cents === null) return reply(origin, 409, { error: "NO_FEE" });
    if (consultation.paid_at) return reply(origin, 409, { error: "ALREADY_PAID" });
    // A booked time is held while the patient pays; Stripe's page closes when the hold ends.
    let expiresAt: number | undefined;
    if (consultation.hold_until) {
      const { data: hold } = await admin.rpc("renew_hold", { p_token: token });
      if (!hold?.ok) return reply(origin, 409, { error: hold?.error_category ?? "TIME_TAKEN" });
      expiresAt = Math.floor(Date.parse(hold.hold_until) / 1000);
    }

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: { currency: "eur", unit_amount: consultation.fee_cents, product_data: { name: "Consultation" } },
      }],
      client_reference_id: consultation.id,
      metadata: { consultation_id: consultation.id },
      expires_at: expiresAt,
      success_url: `${origin}/join/?t=${token}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/join/?t=${token}&cancelled=1`,
    });
    return reply(origin, 200, { url: session.url });
  } catch (error) {
    // Stripe's message never reaches the patient; its type goes to the function log.
    console.error("payment failed", error instanceof Error ? error.name : "unknown");
    return reply(origin, 502, { error: "PAYMENT_UNAVAILABLE" });
  }
});
