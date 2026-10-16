import { expect, signIn, test } from "./account";
import { attachTrack, browserClient, localStack, rpc, sqlAsOwner } from "../tests/local-stack";


test("create a consultation, Watson numbers it, record consent; the video call is the only way to record", async ({ page, account, problems }) => {
  await signIn(page, account);

  // No reference to type (owner, 16 Oct, B): Watson numbers the consultation itself.
  await page.getByRole("link", { name: "New consultation" }).first().click();
  await expect(page.getByLabel("Patient reference")).toHaveCount(0);
  await page.getByLabel("Notes").fill("sleep complaint, patient mentions a supplement");
  await page.getByLabel(/Consent to transcription is recorded/).uncheck();
  await page.getByRole("button", { name: "Create consultation" }).click();
  const heading = page.getByRole("heading", { level: 1, name: /^SYN-\d{6}$/ });
  await expect(heading).toBeVisible();
  const reference = (await heading.textContent())!;

  await expect(page.getByText("Not recorded yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record consent" }).click();
  await expect(page.getByText(/^Recorded \d+ \w+$/)).toBeVisible();

  // No boxes to upload or record audio (owner, 16 Oct, D): the call records both voices.
  await expect(page.getByRole("region", { name: /track/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start video call" })).toBeVisible();

  // The list shows it, and its row leads back here.
  await page.getByRole("link", { name: "Consultations", exact: true }).click();
  const row = page.getByRole("link", { name: new RegExp(reference) });
  await expect(row).toContainText("Waiting for the call");
  await row.click();
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a call saved only in part can be discarded and made again", async ({ page, account, problems }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "attaches one track directly through the local database functions");
  const client = browserClient(localStack());
  const { data } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  const who = { id: data.user!.id, email: account.email, client };
  const made = await rpc(client, "create_consultation", { p_scheduled_at: new Date().toISOString(), p_language: "en", p_consent_recorded: true });
  await attachTrack(who, made.consultation_id!, "practitioner");

  await signIn(page, account);
  await page.goto(`/consultation/?id=${made.consultation_id}`);
  const half = page.getByRole("status").filter({ hasText: "The last call was saved only in part" });
  await half.getByRole("button", { name: "Discard and call again" }).click();
  await expect(page.getByRole("link", { name: "Start video call" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a consultation that is not yours looks the same as one that does not exist", async ({ page, account }) => {
  await signIn(page, account);
  await page.goto("/consultation/?id=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This consultation does not exist, or it is not yours.")).toBeVisible();
  await page.goto("/consultation/?id=not-an-id");
  await expect(page.getByText("This consultation does not exist, or it is not yours.")).toBeVisible();
});

test("a new consultation starts in English, and says another language can be chosen", async ({ page, account, problems }) => {
  await signIn(page, account);
  await page.getByRole("link", { name: "New consultation" }).first().click();
  await expect(page.getByLabel("Language spoken")).toHaveValue("en");
  await expect(page.getByText("English unless you choose another.")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the numbers on Home filter the consultations below them", async ({ page, account, problems }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "prepares an approved consultation directly in the local database");
  const client = browserClient(localStack());
  await client.auth.signInWithPassword({ email: account.email, password: account.password });
  const made = await rpc(client, "create_consultation", {
    p_synthetic_patient_ref: "SYN-0099", p_scheduled_at: new Date().toISOString(), p_language: "en", p_consent_recorded: true,
  });
  sqlAsOwner(`update public.consultations set status = 'approved' where id = '${made.consultation_id}';`);

  await signIn(page, account);
  const needYou = page.getByRole("button", { name: /Need you/ });
  await expect(needYou).toHaveAttribute("aria-pressed", "false");
  await needYou.click();
  await expect(needYou).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Done" })).toHaveCount(0);

  await page.getByRole("button", { name: /Approved this week/ }).click();
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toHaveCount(0);

  await page.getByRole("button", { name: /Approved this week/ }).click(); // pressed again: everything
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  expect(problems).toEqual([]);
});
