// Helpers for tests that run against the local Supabase stack (`supabase start`).
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export const PASSWORD = "correct-horse-battery-1";

export function localStack() {
  const raw = execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  return {
    url: status.API_URL as string,
    publishableKey: status.PUBLISHABLE_KEY as string,
    secretKey: status.SECRET_KEY as string,
  };
}
type Stack = ReturnType<typeof localStack>;

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/** Bypasses row-level security. Test setup only. */
export function adminClient(stack: Stack) {
  return createClient<Database>(stack.url, stack.secretKey, NO_SESSION);
}

/** What the browser has: the public key, and whatever the signed-in user is allowed. */
export function browserClient(stack: Stack) {
  return createClient<Database>(stack.url, stack.publishableKey, NO_SESSION);
}

/** Creates a test practitioner, first removing any earlier copy and everything it owned. */
export async function freshPractitioner(admin: ReturnType<typeof adminClient>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const earlier = data.users.find((user) => user.email === email);
  if (earlier) {
    await admin.from("consultations").delete().eq("practitioner_id", earlier.id);
    await admin.auth.admin.deleteUser(earlier.id);
  }
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  return created.data.user.id;
}
