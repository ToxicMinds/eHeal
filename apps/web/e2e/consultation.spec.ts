import { fileURLToPath } from "node:url";
import { expect, signIn, test } from "./account";

const FIXTURE = fileURLToPath(new URL("../../../packages/test-fixtures/audio/en-patient-sleep.wav", import.meta.url));

test("create a consultation, record consent, attach and remove audio", async ({ page, account, problems }) => {
  const reference = `SYN-${Math.floor(1000 + Math.random() * 9000)}`;
  await signIn(page, account);

  // A name is refused before anything is sent: only the reference format is accepted.
  await page.getByRole("link", { name: "New consultation" }).click();
  await page.getByLabel("Patient reference").fill("Maria Novak");
  await page.getByLabel("Language spoken").selectOption("en");
  await page.getByRole("button", { name: "Create consultation" }).click();
  await expect(page.getByText("Use SYN- and up to eight digits, for example SYN-0042.")).toBeVisible();

  await page.getByLabel("Patient reference").fill(reference);
  await page.getByLabel("Notes").fill("sleep complaint, patient mentions a supplement");
  await page.getByRole("button", { name: "Create consultation" }).click();

  // Without consent, nothing can be attached.
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
  await expect(page.getByText("Waiting for consent")).toBeVisible();
  await expect(page.getByText("Record consent first.")).toHaveCount(2);
  await page.getByRole("button", { name: "Record consent" }).click();
  await expect(page.getByText("Consent to transcription was recorded on")).toBeVisible();
  await expect(page.getByText("Waiting for audio")).toBeVisible();

  // The practitioner's track from a file.
  const practitioner = page.getByRole("region", { name: "Practitioner audio" });
  const patient = page.getByRole("region", { name: "Patient audio" });
  await practitioner.getByLabel("Attach a file").setInputFiles(FIXTURE);
  await expect(practitioner.getByText("wav", { exact: true })).toBeVisible();
  await expect(practitioner.getByText("0:07")).toBeVisible();
  await expect(practitioner.getByText("323 KB")).toBeVisible();
  await expect(practitioner.getByText(/^[0-9a-f]{16}…$/)).toBeVisible();

  // A file that is not audio is refused with a reason.
  await patient.getByLabel("Attach a file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
  await expect(patient.getByRole("alert")).toContainText("This audio format is not supported.");

  // The patient's track from the microphone.
  await patient.getByRole("button", { name: "Record with the microphone" }).click();
  await expect(patient.getByText(/Recording… 0:0\d/)).toBeVisible();
  await page.waitForTimeout(1500);
  await patient.getByRole("button", { name: "Stop recording" }).click();
  await expect(patient.getByText(/^Recording ready:/)).toBeVisible();
  await patient.getByRole("button", { name: "Attach this recording" }).click();
  await expect(patient.getByText("webm", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready to transcribe")).toBeVisible();

  // The declaration survives a reload.
  const together = page.getByLabel(/Both tracks were recorded together/);
  await together.click(); // the box follows the stored value, which arrives a moment later
  await expect(together).toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/Both tracks were recorded together/)).toBeChecked();

  // Removing a track steps the consultation back.
  await page.getByRole("button", { name: "Remove patient audio" }).click();
  await expect(page.getByText("Waiting for audio")).toBeVisible();
  await expect(page.getByRole("region", { name: "Patient audio" }).getByLabel("Attach a file")).toBeVisible();

  // The list shows it, and its reference leads back here.
  await page.getByRole("link", { name: "Consultations", exact: true }).first().click();
  const row = page.getByRole("row", { name: new RegExp(reference) });
  await expect(row).toContainText("Waiting for audio");
  await row.getByRole("link", { name: reference }).click();
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
