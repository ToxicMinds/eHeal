// Watson's engine in the cloud (decision 0009): Home no longer talks about a laptop when the engine
// starts by itself, and says so plainly when this month's allowance is used up.
import { expect, signIn, test } from "./account";

const status = (answer: object) => async (route: import("@playwright/test").Route) =>
  route.fulfill({ json: { online: false, last_seen_at: null, on_demand: true, paused: false, ...answer } });

test("Home says the cloud engine is ready, working, or paused for the month", async ({ page, account, problems }) => {
  await page.route("**/rest/v1/rpc/engine_status", status({}));
  await signIn(page, account);
  await expect(page.getByText("Watson's engine is ready: it starts by itself when there is work")).toBeVisible();
  await expect(page.getByText(/laptop/i)).toHaveCount(0);

  await page.unroute("**/rest/v1/rpc/engine_status");
  await page.route("**/rest/v1/rpc/engine_status", status({ online: true, last_seen_at: new Date().toISOString() }));
  await page.reload();
  await expect(page.getByText("Watson's engine is working")).toBeVisible();

  await page.unroute("**/rest/v1/rpc/engine_status");
  await page.route("**/rest/v1/rpc/engine_status", status({ paused: true }));
  await page.reload();
  await expect(page.getByText("Watson's engine is paused: this month's allowance is used. Transcripts and forms wait until the 1st.")).toBeVisible();
  expect(problems).toEqual([]);
});

test("Home still reports the laptop where the engine runs on a laptop", async ({ page, account }) => {
  await page.route("**/rest/v1/rpc/engine_status", status({ on_demand: false }));
  await signIn(page, account);
  await expect(page.getByText(/^Watson's laptop is off/)).toBeVisible();
});
