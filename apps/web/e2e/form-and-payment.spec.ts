import { readFileSync } from "node:fs";
import { adminClient, browserClient, localStack, rpc, sqlAsOwner } from "../tests/local-stack";
import { expect, signIn, test } from "./account";

const TEMPLATE = readFileSync(new URL("../../../packages/test-fixtures/templates/ayurveda-intake.json", import.meta.url), "utf8");

/** A consultation whose form Watson has just filled in: three answers, the rest not discussed. */
function filledForm(consultationId: string) {
  const answers: Record<string, [string, number[]]> = {
    age: ["42", [1]],
    diet: ["Skips breakfast; three coffees before lunch.", [3]],
    present_conditions: ["Hyperacidity (amla pitta).", [4]],
  };
  const keys = (JSON.parse(TEMPLATE).sections as { fields: { key: string }[] }[]).flatMap((s) => s.fields.map((f) => f.key));
  const rows = keys.map((key, i) => {
    const [text, evidence] = answers[key] ?? [null, []];
    return `((select id from f), '${key}', ${i}, ${text === null ? "null" : `'${text}'`}, '{${evidence.join(",")}}')`;
  });
  const lines = [["practitioner", "How old are you?"], ["patient", "I'm forty-two."], ["practitioner", "And your meals?"],
    ["patient", "I skip breakfast and have three coffees before lunch."], ["practitioner", "There is a lot of pitta: the acidity."]];
  sqlAsOwner(`
    with c as (select * from public.consultations where id = '${consultationId}'),
    j as (insert into public.transcription_jobs (consultation_id, requested_by, status, finished_at)
          select id, practitioner_id, 'completed', now() from c returning id),
    t as (insert into public.transcripts (consultation_id, job_id, schema_version, ordering, low_confidence_threshold, tracks)
          select '${consultationId}', id, '2.0.0', 'exact', 0.5, '[]' from j returning id),
    s as (insert into public.transcript_segments (id, transcript_id, position, speaker, start_seconds, end_seconds, machine_text)
          select gen_random_uuid(), t.id, x.n - 1, x.who::public.speaker, x.n * 5, x.n * 5 + 4, x.said
          from t, (values ${lines.map(([who, said], i) => `(${i + 1}, '${who}', '${said.replace(/'/g, "''")}')`).join(", ")}) as x(n, who, said) returning 1),
    fj as (insert into public.form_jobs (consultation_id, transcript_id, status, claimed_at, finished_at)
           select '${consultationId}', id, 'completed', now() - interval '4 minutes', now() from t returning id, transcript_id),
    f as (insert into public.forms (consultation_id, job_id, transcript_id, template)
          select '${consultationId}', id, transcript_id, '${TEMPLATE.replace(/'/g, "''")}'::jsonb from fj returning id)
    insert into public.form_answers (form_id, field_key, position, machine_text, evidence) values ${rows.join(", ")};
    update public.consultations set status = 'draft_ready' where id = '${consultationId}';`);
}

async function consultation(account: { email: string; password: string }, fee?: number) {
  const client = browserClient(localStack());
  await client.auth.signInWithPassword({ email: account.email, password: account.password });
  const made = await rpc(client, "create_consultation", {
    p_synthetic_patient_ref: "SYN-0061", p_scheduled_at: "2026-10-14T07:30:00Z", p_language: "en",
    p_consent_recorded: true, p_fee_cents: fee,
  });
  const { data } = await client.from("consultations").select("id, invite_token").eq("id", made.consultation_id!).single();
  return data!;
}

test("check every answer of the filled-in form against its quote, then approve it", async ({ page, account, problems }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "prepares a filled-in form directly in the local database");
  const { id } = await consultation(account);
  filledForm(id);

  await signIn(page, account);
  await page.goto(`/consultation/?id=${id}`);
  await expect(page.getByRole("listitem").filter({ hasText: "Ready to check" })).toBeVisible();
  await page.getByRole("link", { name: "Check the form" }).click();

  await expect(page.getByText("Check every answer against its quote")).toBeVisible();
  await expect(page.getByText("3 of 21 answered")).toBeVisible();
  await expect(page.getByText("3 answers still to check")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve form" })).toBeDisabled();

  const age = page.getByRole("article", { name: "Age" });
  await expect(age.getByText("I'm forty-two.")).toBeVisible(); // the quote, with its speaker
  await expect(age.getByText("Patient · 0:10")).toBeVisible();
  await age.getByRole("button", { name: "Accept" }).click();
  await expect(age.getByText("Accepted")).toBeVisible();

  const diet = page.getByRole("article", { name: "Diet" });
  await diet.getByRole("button", { name: "Edit" }).click();
  await diet.getByLabel("Your answer").fill("Skips breakfast. Three cups of coffee before lunch.");
  await diet.getByRole("button", { name: "Save" }).click();
  await expect(diet.getByText("Edited by you")).toBeVisible();
  await expect(diet.getByText("Three cups of coffee before lunch.")).toBeVisible();

  const diagnosis = page.getByRole("article", { name: /Diagnosis: present conditions/ });
  await expect(diagnosis.getByText("Suggestion")).toBeVisible();
  await diagnosis.getByRole("button", { name: "Reject" }).click();
  await expect(diagnosis.getByText("Rejected")).toBeVisible();

  const exercise = page.getByRole("article", { name: "Exercise" });
  await expect(exercise.getByText("Not discussed in the conversation.")).toBeVisible();

  await expect(page.getByText("Every answer is checked.")).toBeVisible();
  await page.getByRole("button", { name: "Approve form" }).click();
  await expect(page.getByText("This form is final.")).toBeVisible();
  await page.getByRole("link", { name: "Consultation", exact: true }).click();
  await expect(page.getByRole("link", { name: "View the form" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("set a fee, send the patient's link; the patient sees the fee, then pays and can join", async ({ page, account, problems }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "records the payment directly in the local database");
  await signIn(page, account);
  await page.getByRole("link", { name: "New consultation" }).click();
  await page.getByLabel("Patient reference").fill("0062");
  await page.getByLabel("Language spoken").selectOption("en");
  await page.getByLabel("Fee").fill("40");
  await page.getByRole("button", { name: "Create consultation" }).click();
  await expect(page.getByText("Fee €40.00")).toBeVisible();
  await expect(page.getByText("Not paid yet")).toBeVisible();
  const link = await page.getByLabel("Link for the patient").inputValue();
  expect(link).toMatch(/\/join\/\?t=[0-9a-f]{64}$/);

  const patient = await page.context().browser()!.newPage();
  await patient.goto(link);
  await expect(patient.getByText("€40.00", { exact: true })).toBeVisible();
  await expect(patient.getByRole("button", { name: "Pay €40.00" })).toBeVisible();
  await expect(patient.getByRole("button", { name: "Join the call" })).toHaveCount(0);

  // What Stripe's confirmation does, done here directly: the server records the payment.
  const id = new URL(page.url()).searchParams.get("id")!;
  const recorded = await adminClient(localStack()).rpc("record_payment", { p_consultation_id: id, p_session_id: "cs_test_e2e", p_amount_cents: 4000 });
  expect(recorded.data).toEqual({ ok: true });
  await patient.reload();
  await expect(patient.getByText("Paid. Thank you.")).toBeVisible();
  await expect(patient.getByRole("button", { name: "Join the call" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Paid €40\.00/)).toBeVisible();
  await patient.close();
  expect(problems).toEqual([]);
});
