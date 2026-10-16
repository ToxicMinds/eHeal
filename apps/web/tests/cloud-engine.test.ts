// Watson's engine in the cloud (owner, 16 October; decision 0009): started on Modal when work waits,
// stopped when there is none, and paused once the month's allowance of running time is used, so the
// bill stays inside Modal's free credit. The database decides when to wake it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localStack, newEngine, newPractitioner, rpc, sqlAsOwner, transcriptWithFormJob, type Practitioner } from "./local-stack";

const stack = localStack();
let cloud: Practitioner;
let cara: Practitioner;
beforeAll(async () => {
  [cloud, cara] = await Promise.all([newEngine(stack, "cloud"), newPractitioner(stack, "cloud-cara")]);
  sqlAsOwner(`update public.engines set on_demand = true where user_id = '${cloud.id}';`);
});
afterAll(() => {
  sqlAsOwner(`delete from public.engine_runs; update public.engines set on_demand = false;`);
});

const decision = () => sqlAsOwner("select private.engine_wake_decision();");
/** No work waiting anywhere: what earlier test files left queued is set aside as failed. */
const noWork = () => sqlAsOwner(`
  update public.transcription_jobs set status = 'failed', error_category = 'ENGINE_STALLED' where status in ('queued', 'processing');
  update public.form_jobs set status = 'failed', error_category = 'ENGINE_STALLED' where status in ('queued', 'processing');
  update public.patient_documents set reading = 'failed', error_category = 'ENGINE_STALLED' where reading in ('waiting', 'reading');`);
async function waitingForm() {
  const made = await rpc(cara.client, "create_consultation", { p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "en", p_consent_recorded: true });
  transcriptWithFormJob(made.consultation_id!);
}

describe("the cloud engine", () => {
  it("is woken when work waits and nothing runs, and not otherwise", async () => {
    noWork();
    expect(decision()).toBe("no work");
    await waitingForm();
    expect(decision()).toBe("wake");

    const started = await rpc(cloud.client, "engine_run_started");
    expect(started).toMatchObject({ ok: true, run_id: expect.any(String) });
    expect(decision()).toBe("running");
  });

  it("may stop only when no work waits, so a job that arrives as it stops is never stranded", async () => {
    const { run_id: run } = await rpc(cloud.client, "engine_run_started");
    await waitingForm();
    expect(await rpc(cloud.client, "engine_run_finished", { p_run_id: run })).toEqual({ ok: false, work_waiting: true });
    noWork();
    expect(await rpc(cloud.client, "engine_run_finished", { p_run_id: run })).toEqual({ ok: true });
    expect(decision()).toBe("no work");
  });

  it("closes its own runs that never finished when it starts again (a container that died)", async () => {
    const { run_id: lost } = await rpc(cloud.client, "engine_run_started");
    await rpc(cloud.client, "engine_run_started");
    expect(sqlAsOwner(`select finished_at is not null from public.engine_runs where id = '${lost}';`)).toBe("t");
  });

  it("pauses for the rest of the month once its allowance is used, and Home is told", async () => {
    sqlAsOwner(`delete from public.engine_runs;
      insert into public.engine_runs (engine_user_id, started_at, finished_at)
        values ('${cloud.id}', now() - interval '3 hours 1 minute', now());`);
    await waitingForm();
    expect(decision()).toBe("allowance used");
    expect(await rpc(cara.client, "engine_status")).toMatchObject({ on_demand: true, paused: true });

    sqlAsOwner("delete from public.engine_runs;");
    expect(decision()).toBe("wake");
    expect(await rpc(cara.client, "engine_status")).toMatchObject({ on_demand: true, paused: false });
  });

  it("is not woken where no engine runs on demand (the laptop engine)", async () => {
    sqlAsOwner("update public.engines set on_demand = false;");
    expect(decision()).toBe("no on-demand engine");
    expect(await rpc(cara.client, "engine_status")).toMatchObject({ on_demand: false, paused: false });
    sqlAsOwner(`update public.engines set on_demand = true where user_id = '${cloud.id}';`);
  });

  it("keeps its runs to engines", async () => {
    expect(await rpc(cara.client, "engine_run_started")).toMatchObject({ ok: false, error_category: "NOT_AN_ENGINE" });
    expect(await rpc(cara.client, "engine_run_finished", { p_run_id: "00000000-0000-0000-0000-000000000000" })).toMatchObject({ ok: false, error_category: "NOT_AN_ENGINE" });
  });
});
