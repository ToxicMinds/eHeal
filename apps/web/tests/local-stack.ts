// Helpers for tests that run against the local Supabase stack (`supabase start`).
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export const PASSWORD = "correct-horse-battery-1";
export const FIXTURE_WAV = readFileSync(
  new URL("../../../packages/test-fixtures/audio/en-patient-sleep.wav", import.meta.url),
);

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

/** The engine credential. It reads everything but changes state only through functions. */
export function adminClient(stack: Stack) {
  return createClient<Database>(stack.url, stack.secretKey, NO_SESSION);
}

/** What the browser has: the public key, and whatever the signed-in user is allowed. */
export function browserClient(stack: Stack) {
  return createClient<Database>(stack.url, stack.publishableKey, NO_SESSION);
}

/** A brand-new practitioner with a unique email, signed in the way a browser would be. */
export async function newPractitioner(stack: Stack, label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@eheal.test`;
  const created = await adminClient(stack).auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const client = browserClient(stack);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { id: created.data.user.id, email, client };
}
export type Practitioner = Awaited<ReturnType<typeof newPractitioner>>;

type Result = { ok: boolean; error_category?: string; field?: string; consultation_id?: string; track_id?: string };

/** Calls a database function and returns its {ok, ...} answer. */
export async function rpc(client: Practitioner["client"], name: string, args: object): Promise<Result> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as unknown as Result;
}

export async function createConsultation(who: Practitioner, options: { consent?: boolean; ref?: string } = {}) {
  const result = await rpc(who.client, "create_consultation", {
    p_synthetic_patient_ref: options.ref ?? "SYN-0042",
    p_scheduled_at: "2026-10-05T08:30:00Z",
    p_language: "en",
    p_consent_recorded: options.consent ?? true,
    p_scenario_notes: "sleep complaint",
  });
  if (!result.ok || !result.consultation_id) throw new Error(`create_consultation refused: ${result.error_category}`);
  return result.consultation_id;
}

export const SHA256_OF_FIXTURE = execSync(
  "sha256sum ../../packages/test-fixtures/audio/en-patient-sleep.wav", { encoding: "utf8" },
).split(" ")[0];

/** Uploads the fixture as one speaker's track and registers it, as the web app does. */
export async function attachTrack(who: Practitioner, consultationId: string, speaker: "practitioner" | "patient") {
  const path = `${who.id}/${consultationId}/${speaker}`;
  await who.client.storage.from("audio").remove([path]);
  const upload = await who.client.storage.from("audio").upload(path, FIXTURE_WAV, { contentType: "audio/wav" });
  if (upload.error) throw new Error(`upload refused: ${upload.error.message}`);
  return rpc(who.client, "register_audio_track", {
    p_consultation_id: consultationId, p_speaker: speaker, p_format: "wav",
    p_size_bytes: FIXTURE_WAV.byteLength, p_sha256: SHA256_OF_FIXTURE, p_duration_seconds: 7.49,
  });
}

/** Runs SQL as the database owner. For tests that must tamper with data directly. */
export function sqlAsOwner(sql: string) {
  return execSync(`docker exec -i supabase_db_eHeal psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, {
    input: sql, encoding: "utf8",
  }).trim();
}
