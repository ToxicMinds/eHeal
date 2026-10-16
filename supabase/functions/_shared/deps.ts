// The one place Watson's edge functions pin their libraries: every function imports them from here,
// so each version is written once.
export { createClient } from "npm:@supabase/supabase-js@2.117.2";
export { default as Stripe } from "npm:stripe@22.6.2";
