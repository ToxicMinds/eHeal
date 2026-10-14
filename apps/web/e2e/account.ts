import { test as base, expect } from "@playwright/test";
import { createConsultation, localStack, newPractitioner, PASSWORD, rpc } from "../tests/local-stack";

type Account = { email: string; password: string; references: string[] };

/**
 * `account` is a practitioner who can sign in. Locally it is created fresh with two
 * consultations. Against a deployed app it is the test account named in the environment.
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
      const who = await newPractitioner(localStack(), "e2e");
      await createConsultation(who, { ref: "SYN-0042", consent: true });
      const later = await rpc(who.client, "create_consultation", {
        p_synthetic_patient_ref: "SYN-0043", p_scheduled_at: "2026-10-06T08:30:00Z",
        p_language: "sk", p_consent_recorded: false,
      });
      if (!later.ok) throw new Error("could not prepare the second consultation");
      await provide({ email: who.email, password: PASSWORD, references: ["SYN-0043", "SYN-0042"] });
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

export async function signIn(page: import("@playwright/test").Page, account: Account) {
  await page.goto("/sign-in/");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
}
