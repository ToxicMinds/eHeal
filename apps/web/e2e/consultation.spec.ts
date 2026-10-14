import { fileURLToPath } from "node:url";
import { expect, signIn, test } from "./account";

const FIXTURE = fileURLToPath(new URL("../../../packages/test-fixtures/audio/en-patient-sleep.wav", import.meta.url));

test("create a consultation, record consent, attach and remove audio", async ({ page, account, problems }) => {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const reference = `SYN-${digits}`;
  await signIn(page, account);

  // A name is refused before anything is sent: the reference takes digits only.
  await page.getByRole("link", { name: "New consultation" }).first().click();
  await page.getByLabel("Patient reference").fill("Maria Novak");
  await page.getByLabel("Language spoken").selectOption("en");
  await page.getByRole("button", { name: "Create consultation" }).click();
  await expect(page.getByText("Use up to eight digits, for example 0042.")).toBeVisible();

  await page.getByLabel("Patient reference").fill(digits);
  await page.getByLabel("Notes").fill("sleep complaint, patient mentions a supplement");
  await page.getByLabel(/Consent to transcription is recorded/).uncheck();
  await page.getByRole("button", { name: "Create consultation" }).click();

  // Without consent, nothing can be attached.
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
  await expect(page.getByText("Not recorded yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Practitioner track" })).toHaveCount(0);
  await page.getByRole("button", { name: "Record consent" }).click();
  await expect(page.getByText(/^Recorded \d+ \w+$/)).toBeVisible();
  await expect(page.getByText("Waiting for both tracks")).toBeVisible();

  // The practitioner's track from a file.
  const practitioner = page.getByRole("region", { name: "Practitioner track" });
  const patient = page.getByRole("region", { name: "Patient track" });
  await practitioner.getByLabel("Practitioner audio file").setInputFiles(FIXTURE);
  await expect(practitioner.getByText("WAV", { exact: true })).toBeVisible();
  await expect(practitioner.getByText("0:07")).toBeVisible();
  await expect(practitioner.getByText("323 KB")).toBeVisible();
  await practitioner.getByText("Details").click();
  await expect(practitioner.getByText(/^SHA-256 [0-9a-f]{64}$/)).toBeVisible();

  // A file that is not audio is refused with a reason.
  await patient.getByLabel("Patient audio file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
  await expect(patient.getByRole("alert")).toContainText("This audio format is not supported.");

  // The patient's track from the microphone.
  await patient.getByRole("button", { name: "Record with microphone" }).click();
  await expect(patient.getByRole("timer")).toHaveText(/^0:0\d$/);
  await page.waitForTimeout(1500);
  await patient.getByRole("button", { name: "Stop" }).click();
  await expect(patient.getByText(/^Recording ready:/)).toBeVisible();
  await patient.getByRole("button", { name: "Attach this recording" }).click();
  await expect(patient.getByText("WEBM", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready to start")).toBeVisible();

  // The declaration survives a reload.
  const together = page.getByLabel(/Both tracks were recorded together/);
  await together.click(); // the box follows the stored value, which arrives a moment later
  await expect(together).toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/Both tracks were recorded together/)).toBeChecked();

  // Removing a track steps the consultation back.
  await page.getByRole("button", { name: "Remove patient audio" }).click();
  await expect(page.getByText("Waiting for the patient track")).toBeVisible();
  await expect(page.getByRole("region", { name: "Patient track" }).getByLabel("Patient audio file")).toBeAttached();

  // The list shows it, and its row leads back here.
  await page.getByRole("link", { name: "Consultations", exact: true }).click();
  const row = page.getByRole("link", { name: new RegExp(reference) });
  await expect(row).toContainText("Waiting for audio");
  await row.click();
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a consultation that is not yours looks the same as one that does not exist", async ({ page, account }) => {
  await signIn(page, account);
  await page.goto("/consultation/?id=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This consultation does not exist, or it is not yours.")).toBeVisible();
  await page.goto("/consultation/?id=not-an-id");
  await expect(page.getByText("This consultation does not exist, or it is not yours.")).toBeVisible();
});
