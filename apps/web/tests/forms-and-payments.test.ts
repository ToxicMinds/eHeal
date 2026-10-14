// Slice 1.5 and patient payment (decisions 0005 and 0007): who may touch a form, what the
// patient's link reveals, and that only the server can mark a consultation paid.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, browserClient, localStack, newPractitioner, rpc, type Practitioner } from "./local-stack";

const stack = localStack();
const TEMPLATE = JSON.parse(readFileSync(new URL("../../../packages/test-fixtures/templates/ayurveda-intake.json", import.meta.url), "utf8"));
let eva: Practitioner;
let finn: Practitioner;
beforeAll(async () => {
  [eva, finn] = await Promise.all([newPractitioner(stack, "eva"), newPractitioner(stack, "finn")]);
});

const create = (who: Practitioner, fee?: number) => rpc(who.client, "create_consultation", {
  p_synthetic_patient_ref: "SYN-0042", p_scheduled_at: "2026-10-05T08:30:00Z", p_language: "en",
  p_consent_recorded: true, p_fee_cents: fee,
});
const row = async (who: Practitioner, id: string) =>
  (await who.client.from("consultations").select("*").eq("id", id).single()).data!;

describe("form templates", () => {
  it("are accepted only when well formed, and only for the practitioner who sets them", async () => {
    expect(await rpc(eva.client, "set_form_template", { p_definition: TEMPLATE })).toEqual({ ok: true });
    for (const bad of [{}, { title: "T", sections: [] }, { title: "T", sections: [{ title: "S", fields: [{ key: "Bad Key", label: "x" }] }] },
      { title: "T", sections: [{ title: "S", fields: [{ key: "a", label: "x" }, { key: "a", label: "y" }] }] },
      { title: "T", sections: [{ title: "S", fields: [{ key: "a", label: "x", mode: "diagnose" }] }] }]) {
      expect(await rpc(eva.client, "set_form_template", { p_definition: bad }), JSON.stringify(bad)).toEqual({ ok: false, error_category: "VALIDATION", field: "definition" });
    }
    expect((await finn.client.from("form_templates").select("*")).data).toEqual([]);
  });

  it("are refused to a signed-out visitor", async () => {
    expect((await browserClient(stack).rpc("set_form_template", { p_definition: TEMPLATE })).error).not.toBeNull();
  });
});

describe("a fee", () => {
  it("is stored in cents, and refused when it is out of range", async () => {
    const made = await create(eva, 4000);
    expect((await row(eva, made.consultation_id!)).fee_cents).toBe(4000);
    for (const fee of [0, 49, 100001]) {
      expect(await create(eva, fee)).toEqual({ ok: false, error_category: "VALIDATION", field: "fee_cents" });
    }
  });
});

describe("the patient's link", () => {
  it("reveals the time, the fee and whether it is paid, and nothing about anyone else", async () => {
    const made = await create(eva, 4000);
    const { invite_token: token } = await row(eva, made.consultation_id!);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const visitor = browserClient(stack);
    const { data } = await visitor.rpc("invite_details", { p_token: token });
    expect(data).toEqual({ ok: true, scheduled_at: "2026-10-05T08:30:00+00:00", fee_cents: 4000, currency: "eur", paid: false, paid_at: null, patient: null, documents: [] });
    expect((await visitor.rpc("invite_details", { p_token: "0".repeat(64) })).data).toEqual({ ok: false, error_category: "NOT_FOUND" });
    expect((await visitor.rpc("invite_details", { p_token: "' or 1=1 --" })).data).toEqual({ ok: false, error_category: "NOT_FOUND" });
  });
});

describe("a payment", () => {
  it("can be recorded only by the server, once, and only for the right amount", async () => {
    const made = await create(eva, 4000);
    const id = made.consultation_id!;
    const args = { p_consultation_id: id, p_session_id: `cs_test_${id}`, p_amount_cents: 4000 };
    expect((await browserClient(stack).rpc("record_payment", args)).error).not.toBeNull();
    expect((await eva.client.rpc("record_payment", args)).error).not.toBeNull();

    const server = adminClient(stack);
    expect((await server.rpc("record_payment", { ...args, p_amount_cents: 100 })).data).toEqual({ ok: false, error_category: "VALIDATION", field: "amount" });
    expect((await server.rpc("record_payment", args)).data).toEqual({ ok: true });
    expect((await server.rpc("record_payment", args)).data).toEqual({ ok: true, already: true });
    const paid = await row(eva, id);
    expect(paid.paid_amount_cents).toBe(4000);
    expect(paid.paid_at).not.toBeNull();
    const events = (await eva.client.from("audit_events").select("event_type, actor_role").eq("consultation_id", id)).data ?? [];
    expect(events.filter((event) => event.event_type === "payment.received")).toEqual([{ event_type: "payment.received", actor_role: "payment" }]);
  });
});

describe("a form", () => {
  it("cannot be started, reviewed or approved by another practitioner", async () => {
    const made = await create(eva);
    const id = made.consultation_id!;
    expect(await rpc(finn.client, "start_form", { p_consultation_id: id })).toEqual({ ok: false, error_category: "NOT_FOUND" });
    expect(await rpc(eva.client, "start_form", { p_consultation_id: id })).toMatchObject({ error_category: "INVALID_STATE_TRANSITION" });
    const fake = "00000000-0000-0000-0000-000000000000";
    expect(await rpc(finn.client, "review_form_answer", { p_form_id: fake, p_field_key: "age", p_decision: "accept" })).toEqual({ ok: false, error_category: "NOT_FOUND" });
    expect(await rpc(finn.client, "approve_form", { p_form_id: fake })).toEqual({ ok: false, error_category: "NOT_FOUND" });
  });

  it("functions for engines refuse practitioners", async () => {
    expect(await rpc(eva.client, "engine_claim_form_job", {})).toEqual({ ok: false, error_category: "NOT_AN_ENGINE" });
  });
});
