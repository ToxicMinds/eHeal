import { expect, signIn, test } from "./account";

// Pays a fee with Stripe's test card on Stripe's own Checkout page, against the deployed app.
// Runs only when asked: E2E_BASE_URL plus E2E_STRIPE=1, once scripts/configure-stripe.sh has run.
test("a patient pays the fee on Stripe and the practitioner sees it paid", async ({ page, account }) => {
  test.skip(!process.env.E2E_BASE_URL || !process.env.E2E_STRIPE, "needs the deployed app and a Stripe test key");
  test.setTimeout(120_000);
  await signIn(page, account);
  await page.getByRole("link", { name: "New consultation" }).click();
  await page.getByLabel("Language spoken").selectOption("en");
  await page.getByLabel("Fee").fill("12.50");
  await page.getByRole("button", { name: "Create consultation" }).click();
  await expect(page.getByText("Not paid yet")).toBeVisible();
  const link = await page.getByLabel("Link for the patient").inputValue();

  const patient = await page.context().browser()!.newPage();
  await patient.goto(link);
  await patient.getByRole("button", { name: "Pay €12.50" }).click();
  await patient.waitForURL(/checkout\.stripe\.com/);
  await patient.locator("#email").fill("patient@example.com");
  // Checkout lists several methods; the card fields appear once Card is chosen.
  await patient.getByTestId("card-accordion-item").click();
  await patient.locator("#cardNumber").fill("4242 4242 4242 4242");
  await patient.locator("#cardExpiry").fill("12 / 34");
  await patient.locator("#cardCvc").fill("123");
  await patient.locator("#billingName").fill("Test Patient");
  const postal = patient.locator("#billingPostalCode");
  if (await postal.isVisible()) await postal.fill("10001");
  await patient.locator(".SubmitButton, button[type=submit]").first().click();
  await patient.waitForURL(/\/join\/\?t=.*session_id=/, { timeout: 60_000 });
  await expect(patient.getByText("Paid. Thank you.")).toBeVisible({ timeout: 20_000 });
  await expect(patient.getByRole("button", { name: "Join the call" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Paid €12\.50/)).toBeVisible();
});
