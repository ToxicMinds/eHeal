// The WhatsApp function as Watson's own gateway calls it (owner, 16 October): run with Deno against
// the local stack. What it answers is what the gateway sends from the owner's number.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, localStack, newPractitioner, rpc, sqlAsOwner, type Practitioner } from "./local-stack";

const stack = localStack();
const server = adminClient(stack);
const SECRET = `gateway-${randomUUID()}`;
const ADDRESS = `127.0.0.1:${8700 + Math.floor(Math.random() * 200)}`;
const SITE = "https://watson.example";
const CRON = `cron-${randomUUID()}`;
// A stand-in for the gateway on Render: what it answers to the schedule's knock.
let gatewaySays: object | null = { status: "CONNECTED" };
let stand: Server;
const STAND = `127.0.0.1:${8900 + Math.floor(Math.random() * 90)}`;

type Answer = { ok: boolean; send: { id: string; to: string; text: string }[]; contacts: string[] };
const gateway = (body: object, secret = SECRET) => fetch(`http://${ADDRESS}`, {
  method: "POST", headers: { "x-watson-gateway": secret, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const said = async (body: object) => (await (await gateway(body)).json()) as Answer;
const from = () => `4219${Math.floor(Math.random() * 9e7 + 1e7)}`;
const message = (number: string, content: object) => ({ event: "message", message: { id: randomUUID(), from: number, name: "Jana Nováková", ...content } });

let fn: ChildProcess;
let eva: Practitioner;
beforeAll(async () => {
  stand = createServer((request, response) => {
    if (request.url !== "/health" || gatewaySays === null) return response.destroy();
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(gatewaySays));
  });
  await new Promise<void>((resolve) => stand.listen(Number(STAND.split(":")[1]), "127.0.0.1", resolve));
  fn = spawn("deno", ["run", "--allow-net", "--allow-env", "--node-modules-dir=none", "../../supabase/functions/whatsapp/index.ts"], {
    env: { ...process.env, DENO_SERVE_ADDRESS: `tcp:${ADDRESS}`, SUPABASE_URL: stack.url, SUPABASE_SERVICE_ROLE_KEY: stack.secretKey, WHATSAPP_GATEWAY_SECRET: SECRET, SITE_URLS: SITE,
      CRON_SECRET: CRON, WHATSAPP_GATEWAY_URL: `http://${STAND}` },
    stdio: "ignore",
  });
  eva = await newPractitioner(stack, "gw-fn");
  for (let i = 0; i < 300; i++) {
    if (await fetch(`http://${ADDRESS}`).then(() => true, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("the WhatsApp function did not start");
}, 90_000);
afterAll(() => {
  fn?.kill();
  stand?.close();
});

/** A consultation `minutes` from now, and its code. */
async function consultation(minutes = 24 * 60) {
  const made = await rpc(eva.client, "create_consultation", {
    p_scheduled_at: new Date(Date.now() + minutes * 60_000).toISOString(), p_language: "en", p_consent_recorded: true,
  });
  const [code, shortCode] = sqlAsOwner(`select whatsapp_code || ' ' || short_code from public.consultations where id = '${made.consultation_id}';`).split(" ");
  return { id: made.consultation_id!, code, shortCode };
}

describe("the WhatsApp function, called by Watson's own gateway", () => {
  it("refuses a caller without the gateway's secret", async () => {
    expect((await gateway({ event: "poll" }, "wrong")).status).toBe(403);
  });

  it("links a patient who sends their code, answers with their link, and counts them as a patient from then on", async () => {
    const { code, shortCode } = await consultation();
    const number = from();
    const answer = await said(message(number, { text: `Watson ${code}` }));
    expect(answer.send).toEqual([{ id: expect.stringMatching(/^watson\./), to: `+${number}`, text: expect.stringContaining(`${SITE}/j/${shortCode}`) }]);
    expect(answer.send[0].text).not.toContain("Anything you write");
    expect(answer.contacts).toContain(`+${number}`);
    const { data: recorded } = await server.from("whatsapp_messages").select("direction, status, body").eq("wa_message_id", answer.send[0].id).single();
    expect(recorded).toEqual({ direction: "out", status: "sent", body: answer.send[0].text });
  });

  it("keeps a photo from a linked patient as their document, and thanks them", async () => {
    const { id, code } = await consultation();
    const number = from();
    await said(message(number, { text: `Watson ${code}` }));
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const answer = await said(message(number, { media: { type: "image/png", data: pixel } }));
    expect(answer.send).toEqual([{ id: expect.any(String), to: `+${number}`, text: expect.stringMatching(/^Thank you\. I have passed Photo .+\.png on to your practitioner\.$/) }]);
    const { data: documents } = await server.from("patient_documents").select("media_type, size_bytes").eq("consultation_id", id);
    expect(documents).toEqual([{ media_type: "image/png", size_bytes: Buffer.from(pixel, "base64").length }]);
  });

  it("answers a file that is too large without keeping it", async () => {
    const { id, code } = await consultation();
    const number = from();
    await said(message(number, { text: `Watson ${code}` }));
    const answer = await said(message(number, { media: { type: "application/pdf", fileName: "scan.pdf", tooLarge: true } }));
    expect(answer.send.map((m) => m.text)).toEqual(["This file is larger than 10 MB. Could you send a photo of each page instead?"]);
    expect((await server.from("patient_documents").select("id").eq("consultation_id", id)).data).toEqual([]);
  });

  it("never answers a number it does not know, even one sending a code that is no consultation's", async () => {
    const answer = await said(message(from(), { text: "Watson 0000AAAA" }));
    expect(answer.send).toEqual([]);
  });

  it("sends a due reminder with the link written out, only to a patient who wrote to Watson", async () => {
    const { id, code, shortCode } = await consultation(50);
    const number = from();
    await said(message(number, { text: `Watson ${code}` }));
    // Due too, for a patient who asked for reminders when booking but never wrote to Watson.
    const quiet = await consultation(45);
    const stranger = from();
    sqlAsOwner(`with p as (insert into public.patients (practitioner_id, name, phone)
                  select practitioner_id, 'Ivan', '+${stranger}' from public.consultations where id = '${quiet.id}' returning id)
                update public.consultations set remind_whatsapp = true, patient_id = (select id from p) where id = '${quiet.id}';`);

    const answer = await said({ event: "poll" });
    const mine = answer.send.filter((m) => m.to === `+${number}`);
    expect(mine).toEqual([{ id: expect.any(String), to: `+${number}`, text: expect.stringContaining(`Join here when you are ready: ${SITE}/j/${shortCode}`) }]);
    expect(answer.send.filter((m) => m.to === `+${stranger}`)).toEqual([]);
    expect(sqlAsOwner(`select reminder_sent_at is not null from public.consultations where id = '${id}';`)).toBe("t");
    expect((await said({ event: "poll" })).send.filter((m) => m.to === `+${number}`)).toEqual([]);
  });

  it("records a message the gateway could not send as failed", async () => {
    const { code } = await consultation();
    const answer = await said(message(from(), { text: `Watson ${code}` }));
    expect((await gateway({ event: "failed", id: answer.send[0].id, error: "Not connected" })).status).toBe(200);
    const { data } = await server.from("whatsapp_messages").select("status, error").eq("wa_message_id", answer.send[0].id).single();
    expect(data).toEqual({ status: "failed", error: "Not connected" });
  });
});

describe("the WhatsApp function, keeping the gateway's pairing and an eye on it", () => {
  const cron = () => fetch(`http://${ADDRESS}`, { method: "POST", headers: { "x-watson-cron": CRON, "Content-Type": "application/json" }, body: "{}" });
  const health = () => sqlAsOwner("select status from private.whatsapp_gateway_health;");
  const notices = () => sqlAsOwner("select key from private.owner_notices where key like 'whatsapp-%' order by key;");

  it("passes the sealed pairing between the gateway and the database", async () => {
    expect(await said({ event: "state-write", changes: { creds: "sealed-a", "pre-key-1": "sealed-b" } })).toMatchObject({ ok: true });
    expect(await said({ event: "state-write", changes: { "pre-key-1": null } })).toMatchObject({ ok: true });
    const answer = (await (await gateway({ event: "state-read" })).json()) as { ok: boolean; state: Record<string, string> };
    expect(answer.state).toMatchObject({ creds: "sealed-a" });
    expect(answer.state).not.toHaveProperty("pre-key-1");
  });

  it("knocks on the gateway every time the schedule calls, and records what it says", async () => {
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%';");
    gatewaySays = { status: "CONNECTED" };
    expect((await cron()).status).toBe(200);
    expect(health()).toBe("CONNECTED");
    gatewaySays = { status: "SCAN_QR" };
    await cron();
    expect(health()).toBe("SCAN_QR");
    expect(notices()).toBe(`whatsapp-link-${new Date().toISOString().slice(0, 10)}`);
  });

  it("notices a gateway that stopped answering", async () => {
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%'; update private.whatsapp_gateway_health set seen_at = now() - interval '25 minutes';");
    gatewaySays = null;
    expect((await cron()).status).toBe(200);
    expect(notices()).toBe(`whatsapp-down-${new Date().toISOString().slice(0, 10)}`);
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%';");
    gatewaySays = { status: "CONNECTED" };
  });
});
