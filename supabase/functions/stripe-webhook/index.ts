// Stripe calls this when a Checkout payment completes, so a patient who closes the tab
// after paying is still recorded as paid. Only signed events are believed.
import Stripe from "npm:stripe@22.6.2";
import { fulfill, stripe } from "../_shared/payment.ts";

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (request) => {
  const signature = request.headers.get("Stripe-Signature");
  if (request.method !== "POST" || !signature) return new Response(null, { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(), signature, Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, crypto);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await fulfill(event.data.object.id);
  }
  return new Response(null, { status: 200 });
});
