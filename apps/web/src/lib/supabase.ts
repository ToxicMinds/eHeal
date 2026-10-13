import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Both values are public by design: the key only identifies the project, and
// row-level security decides what a signed-in practitioner may read or change.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set when the app is built.",
  );
}

export const supabase = createClient<Database>(url, publishableKey);
