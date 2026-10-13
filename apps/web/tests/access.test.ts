// MASTER_BUILD_SPEC.md section 20.4: nobody reaches another practitioner's data.
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, browserClient, freshPractitioner, localStack, PASSWORD } from "./local-stack";

const stack = localStack();
const admin = adminClient(stack);
const anna = "anna@access.test";
const ben = "ben@access.test";
let annaId: string;
let benId: string;

async function signedIn(email: string) {
  const client = browserClient(stack);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  annaId = await freshPractitioner(admin, anna);
  benId = await freshPractitioner(admin, ben);
  const { error } = await admin.from("consultations").insert([
    { practitioner_id: annaId, synthetic_patient_ref: "SYN-1001", scheduled_at: "2026-10-01T09:00:00Z", language: "en", status: "ready_for_audio" },
    { practitioner_id: benId, synthetic_patient_ref: "SYN-2002", scheduled_at: "2026-10-02T09:00:00Z", language: "de", status: "consent_pending" },
  ]);
  if (error) throw error;
});

describe("consultations", () => {
  it("shows a practitioner only their own", async () => {
    const client = await signedIn(anna);
    const { data, error } = await client.from("consultations").select("synthetic_patient_ref, practitioner_id");
    expect(error).toBeNull();
    expect(data).toEqual([{ synthetic_patient_ref: "SYN-1001", practitioner_id: annaId }]);
  });

  it("shows a signed-out visitor nothing", async () => {
    const { data } = await browserClient(stack).from("consultations").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("cannot be written directly, even by their owner", async () => {
    const client = await signedIn(anna);
    const row = { practitioner_id: annaId, synthetic_patient_ref: "SYN-1003", scheduled_at: "2026-10-03T09:00:00Z", language: "en", status: "approved" } as const;
    expect((await client.from("consultations").insert(row)).error).not.toBeNull();
    await client.from("consultations").update({ status: "approved" }).eq("practitioner_id", annaId);
    await client.from("consultations").delete().eq("practitioner_id", annaId);
    await client.from("consultations").update({ status: "approved" }).eq("practitioner_id", benId);

    const { data } = await admin.from("consultations").select("synthetic_patient_ref, status").in("practitioner_id", [annaId, benId]).order("synthetic_patient_ref");
    expect(data).toEqual([
      { synthetic_patient_ref: "SYN-1001", status: "ready_for_audio" },
      { synthetic_patient_ref: "SYN-2002", status: "consent_pending" },
    ]);
  });

  it("refuses a patient reference that is not synthetic", async () => {
    const { error } = await admin.from("consultations").insert({ practitioner_id: annaId, synthetic_patient_ref: "Maria Novak", scheduled_at: "2026-10-03T09:00:00Z", language: "sk", status: "consent_pending" });
    expect(error?.message).toMatch(/check constraint/);
  });
});

describe("accounts", () => {
  it("cannot be created by the public", async () => {
    const { data, error } = await browserClient(stack).auth.signUp({ email: "stranger@access.test", password: PASSWORD });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const { error } = await browserClient(stack).auth.signInWithPassword({ email: anna, password: "wrong-password-123" });
    expect(error?.status).toBe(400);
  });
});
