import { expect, test } from "./account";

test("a visitor who is not signed in is sent to sign-in", async ({ page, problems }) => {
  await page.goto("/consultations/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("a wrong password is refused with a clear message", async ({ page, account }) => {
  await page.goto("/sign-in/");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("region", { name: "Sign in" }).getByRole("alert")).toContainText("That email and password do not match an account.");
  await expect(page).toHaveURL(/\/sign-in\/$/);
});

test("empty fields are explained before anything is sent", async ({ page }) => {
  await page.goto("/sign-in/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
});

test("a practitioner signs in, sees their consultations, and signs out", async ({ page, account, problems }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
  await expect(page.getByText(`Signed in as ${account.email}`)).toBeVisible();
  if (account.references.length > 0) {
    await expect(page.getByRole("link", { name: /SYN-0043/ })).toContainText("Slovak");
    await expect(page.getByRole("link", { name: /SYN-0043/ })).toContainText("Waiting for consent");
    await expect(page.getByRole("link", { name: /SYN-0042/ })).toContainText("Waiting for audio");
  }

  // The session survives a reload, and ends on sign-out.
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/consultations/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(problems).toEqual([]);
});
