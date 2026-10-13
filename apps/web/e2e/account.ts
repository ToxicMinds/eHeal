import { test as base, expect } from "@playwright/test";
import { adminClient, freshPractitioner, localStack, PASSWORD } from "../tests/local-stack";

type Account = { email: string; password: string; references: string[] };

/**
 * `account` is a practitioner who can sign in. Locally it is created fresh with two
 * consultations. Against a deployed app it is the account named in the environment.
 * `problems` collects anything the browser refused or reported; tests assert it stays empty.
 */
export const test = base.extend<{ problems: string[] }, { account: Account }>({
  account: [
    async ({}, provide) => {
      if (process.env.E2E_BASE_URL) {
        const { E2E_EMAIL: email, E2E_PASSWORD: password } = process.env;
        if (!email || !password) throw new Error("Set E2E_EMAIL and E2E_PASSWORD with E2E_BASE_URL.");
        await provide({ email, password, references: [] });
        return;
      }
      const admin = adminClient(localStack());
      const email = "practitioner@e2e.test";
      const id = await freshPractitioner(admin, email);
      const { error } = await admin.from("consultations").insert([
        { practitioner_id: id, synthetic_patient_ref: "SYN-0042", scheduled_at: "2026-10-05T08:30:00Z", language: "en", status: "ready_for_audio" },
        { practitioner_id: id, synthetic_patient_ref: "SYN-0043", scheduled_at: "2026-10-06T08:30:00Z", language: "sk", status: "transcription_failed" },
      ]);
      if (error) throw error;
      await provide({ email, password: PASSWORD, references: ["SYN-0043", "SYN-0042"] });
    },
    { scope: "worker" },
  ],
  problems: async ({ page }, provide) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    await provide(problems);
  },
});
export { expect };
