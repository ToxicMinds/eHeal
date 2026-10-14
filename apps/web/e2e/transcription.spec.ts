import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  adminClient, attachTrack, browserClient, createConsultation, localStack, newPractitioner, PASSWORD, sqlAsOwner,
} from "../tests/local-stack";
import { expect, signIn, test } from "./account";

const ENGINE = fileURLToPath(new URL("../../clinical-worker", import.meta.url));

test("start transcription, watch it run on a real engine, and read the transcript", async ({ page, account, problems }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "runs a local engine against the local stack");
  test.setTimeout(180_000);
  const stack = localStack();

  // A consultation with consent and both tracks, made the way the app makes it.
  const client = browserClient(stack);
  const { data } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  const who = { id: data.user!.id, email: account.email, client };
  const id = await createConsultation(who, { ref: "SYN-0077" });
  await attachTrack(who, id, "practitioner");
  await attachTrack(who, id, "patient");
  // One queue serves every test; this job must be the one the engine takes.
  sqlAsOwner("update public.transcription_jobs set status = 'cancelled', finished_at = now() where status in ('queued', 'processing');");

  await signIn(page, account);
  await page.goto(`/consultation/?id=${id}`);
  await page.getByRole("button", { name: "Start transcription" }).click();
  await expect(page.getByRole("heading", { name: "Transcribing" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Waiting for the engine" })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("You can leave this page.")).toBeVisible();

  // A real engine, with the small test model, takes the job once.
  const engine = await newPractitioner(stack, "engine");
  const registered = await adminClient(stack).rpc("register_engine", { p_user_id: engine.id, p_label: "e2e" });
  expect(registered.error).toBeNull();
  execFileSync("uv", ["run", "--project", ENGINE, "python", "-c",
    "from clinical_worker.config import load_settings; from clinical_worker.engine import Engine; Engine(load_settings()).run_once()"], {
    env: {
      ...process.env, WATSON_ENV_FILE: "/nonexistent", WATSON_MODEL: "tiny",
      WATSON_SUPABASE_URL: stack.url, WATSON_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
      WATSON_ENGINE_EMAIL: engine.email, WATSON_ENGINE_PASSWORD: PASSWORD,
    },
    stdio: "ignore",
    timeout: 120_000,
  });

  // The page notices on its own and shows the two-voice transcript.
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ready to review")).toBeVisible();
  const turns = page.locator(".wa-turn");
  await expect(turns.filter({ hasText: "Practitioner" }).first()).toBeVisible();
  await expect(turns.filter({ hasText: "Patient" }).first()).toBeVisible();
  await expect(page.locator(".wa-turns")).toContainText(/sleep/i);
  expect(problems).toEqual([]);
});
