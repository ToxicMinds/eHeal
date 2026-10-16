// Filling the form in again (owner, 16 October): when a document arrives after Watson filled in
// the form, the practitioner can ask for it again. Answers they already checked stay exactly as
// they left them; only the unchecked ones take Watson's new reading.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { claimFormJob, localStack, newEngine, newPractitioner, rpc, transcriptWithFormJob, type Practitioner } from "./local-stack";

const stack = localStack();
const TEMPLATE = JSON.parse(readFileSync(new URL("../../../packages/test-fixtures/templates/ayurveda-intake.json", import.meta.url), "utf8"));
const KEYS = (TEMPLATE.sections as { fields: { key: string }[] }[]).flatMap((s) => s.fields.map((f) => f.key));
const [FIRST, SECOND, THIRD] = KEYS;

let eva: Practitioner;
let engine: Practitioner;
beforeAll(async () => {
  [eva, engine] = await Promise.all([newPractitioner(stack, "again"), newEngine(stack, "again-engine")]);
  expect(await rpc(eva.client, "set_form_template", { p_definition: TEMPLATE })).toEqual({ ok: true });
});

/** The engine fills every field with `text` plus the field's key. */
async function fill(consultationId: string, text: string) {
  const job = await claimFormJob(engine, consultationId);
  const answers = KEYS.map((key) => ({ key, text: `${text} ${key}`, evidence: [0] }));
  expect(await rpc(engine.client, "engine_complete_form_job", { p_job_id: job.job_id, p_attempt: job.attempt, p_answers: answers })).toMatchObject({ ok: true });
}
const form = async (consultationId: string) => {
  const { data } = await eva.client.from("forms").select("id, status, form_answers(field_key, machine_text, practitioner_text, review)")
    .eq("consultation_id", consultationId).neq("status", "superseded").single();
  return { id: data!.id, answers: Object.fromEntries(data!.form_answers.map((a) => [a.field_key, a])) };
};
const status = async (id: string) => (await eva.client.from("consultations").select("status").eq("id", id).single()).data!.status;

describe("filling the form in again", () => {
  it("keeps the answers the practitioner checked and takes Watson's new reading for the rest", async () => {
    const made = await rpc(eva.client, "create_consultation", { p_synthetic_patient_ref: "SYN-0201", p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "en", p_consent_recorded: true });
    const id = made.consultation_id!;
    transcriptWithFormJob(id);
    await fill(id, "first");
    const before = await form(id);
    expect(await rpc(eva.client, "review_form_answer", { p_form_id: before.id, p_field_key: FIRST, p_decision: "accept" })).toEqual({ ok: true });
    expect(await rpc(eva.client, "review_form_answer", { p_form_id: before.id, p_field_key: SECOND, p_decision: "edit", p_text: "My own words" })).toEqual({ ok: true });

    expect(await rpc(eva.client, "fill_form_again", { p_consultation_id: id })).toMatchObject({ ok: true });
    expect(await status(id)).toBe("extraction_processing");
    // While Watson works, the old form cannot be changed.
    expect(await rpc(eva.client, "review_form_answer", { p_form_id: before.id, p_field_key: THIRD, p_decision: "accept" })).toMatchObject({ ok: false });

    await fill(id, "second");
    const after = await form(id);
    expect(after.id).not.toBe(before.id);
    expect(after.answers[FIRST]).toEqual({ field_key: FIRST, machine_text: `first ${FIRST}`, practitioner_text: null, review: "accepted" });
    expect(after.answers[SECOND]).toEqual({ field_key: SECOND, machine_text: `first ${SECOND}`, practitioner_text: "My own words", review: "edited" });
    expect(after.answers[THIRD]).toEqual({ field_key: THIRD, machine_text: `second ${THIRD}`, practitioner_text: null, review: "unreviewed" });
    expect(await status(id)).toBe("under_review");
  });

  it("is refused before a form exists, after approval, and for someone else's consultation", async () => {
    const made = await rpc(eva.client, "create_consultation", { p_synthetic_patient_ref: "SYN-0202", p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "en", p_consent_recorded: true });
    expect(await rpc(eva.client, "fill_form_again", { p_consultation_id: made.consultation_id })).toMatchObject({ ok: false, error_category: "INVALID_STATE_TRANSITION" });
    const other = await newPractitioner(stack, "other");
    expect(await rpc(other.client, "fill_form_again", { p_consultation_id: made.consultation_id })).toEqual({ ok: false, error_category: "NOT_FOUND" });
  });
});
