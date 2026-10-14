"use client";

import { Check, ChevronLeft, Info, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/status";
import { call, explain } from "@/lib/api";
import { clock } from "@/lib/audio";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { dateTime } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Answer = Tables<"form_answers">;
type Segment = Pick<Tables<"transcript_segments">, "position" | "speaker" | "start_seconds" | "machine_text" | "reviewed_text">;
type Field = { key: string; label: string; mode?: "extract" | "suggest" };
type Template = { title: string; sections: { title: string; fields: Field[] }[] };
type Loaded = {
  consultation: Tables<"consultations">;
  form: Tables<"forms">;
  answers: Answer[];
  segments: Map<number, Segment>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function FormPage() {
  return (
    <RequireSession>
      {(user) => (
        <AppShell user={user}>
          <Suspense fallback={<p className="wa-meta" role="status">Loading the form…</p>}>
            <FormView />
          </Suspense>
        </AppShell>
      )}
    </RequireSession>
  );
}

async function fetchForm(id: string): Promise<Loaded | "missing" | "failed"> {
  const [consultation, form] = await Promise.all([
    supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
    supabase.from("forms").select("*").eq("consultation_id", id).neq("status", "superseded").maybeSingle(),
  ]);
  if (consultation.error || form.error) return "failed";
  if (!consultation.data || !form.data) return "missing";
  const [answers, segments] = await Promise.all([
    supabase.from("form_answers").select("*").eq("form_id", form.data.id).order("position"),
    supabase.from("transcript_segments").select("position, speaker, start_seconds, machine_text, reviewed_text")
      .eq("transcript_id", form.data.transcript_id),
  ]);
  if (answers.error || segments.error) return "failed";
  return {
    consultation: consultation.data,
    form: form.data,
    answers: answers.data,
    segments: new Map(segments.data.map((segment) => [segment.position, segment])),
  };
}

const CHIP: Record<Answer["review"], [string, string]> = {
  unreviewed: ["wa-chip--attention", "To check"],
  accepted: ["wa-chip--done", "Accepted"],
  edited: ["wa-chip--current", "Edited by you"],
  rejected: ["wa-chip--failed", "Rejected"],
};

function FormView() {
  const id = useSearchParams().get("id") ?? "";
  const [loaded, setLoaded] = useState<Loaded | "missing" | "failed" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchForm(id).then(setLoaded);
  }, [id]);
  useEffect(() => {
    if (!UUID.test(id)) return;
    let current = true;
    fetchForm(id).then((result) => current && setLoaded(result));
    return () => {
      current = false;
    };
  }, [id]);

  const back = (
    <Link href={`/consultation/?id=${id}`} className="wa-crumb"><ChevronLeft aria-hidden className="wa-icon wa-icon--sm" />Consultation</Link>
  );
  if (!UUID.test(id) || loaded === "missing") return <>{back}<p className="wa-text">There is no form for this consultation yet.</p></>;
  if (loaded === "failed") return <>{back}<Notice tone="failed" title="The form could not be loaded">Check your connection and reload the page.</Notice></>;
  if (loaded === null) return <p className="wa-meta" role="status">Loading the form…</p>;

  const { consultation, form, answers, segments } = loaded;
  const template = form.template as unknown as Template;
  const fields = new Map(template.sections.flatMap((section) => section.fields).map((field) => [field.key, field]));
  const byKey = new Map(answers.map((answer) => [answer.field_key, answer]));
  const approved = form.status === "approved";
  const answered = answers.filter((answer) => answer.machine_text !== null).length;
  const toCheck = answers.filter((answer) => answer.machine_text !== null && answer.review === "unreviewed").length;
  const suggestions = template.sections.flatMap((section) => section.fields).filter((field) => field.mode === "suggest").length;

  async function decide(key: string, decision: "accept" | "reject" | "edit" | "undo", text?: string) {
    setBusy(true);
    setProblem(null);
    const outcome = await call("review_form_answer", {
      p_form_id: form.id, p_field_key: key, p_decision: decision, p_text: text,
    });
    setBusy(false);
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    setEditing(null);
    load();
  }
  async function approve() {
    setBusy(true);
    setProblem(null);
    const outcome = await call("approve_form", { p_form_id: form.id });
    setBusy(false);
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    load();
  }
  function edit(answer: Answer) {
    setEditing(answer.field_key);
    setDraft(answer.practitioner_text ?? answer.machine_text ?? "");
  }

  function card(answer: Answer) {
    const field = fields.get(answer.field_key);
    const label = field?.label ?? answer.field_key;
    const empty = answer.machine_text === null && answer.review !== "edited";
    const text = answer.review === "edited" ? answer.practitioner_text : answer.machine_text;
    const [chipClass, chipText] = empty ? ["wa-chip--done", "Not discussed"] : CHIP[answer.review];
    const settled = answer.review !== "unreviewed";
    const modifier = empty ? " wa-answer--empty" : answer.review === "rejected" ? " wa-answer--rejected wa-answer--settled" : settled ? " wa-answer--settled" : "";
    const quotes = answer.evidence.map((position) => segments.get(position)).filter((segment) => segment !== undefined);
    return (
      <article key={answer.field_key} className={`wa-answer${modifier}`} aria-labelledby={`f-${answer.field_key}`}>
        <div className="wa-answer__head">
          <h3 className="wa-answer__label" id={`f-${answer.field_key}`}>
            {label}{field?.mode === "suggest" && <> <span className="wa-tag wa-tag--attention">Suggestion</span></>}
          </h3>
          <span className={`wa-chip ${chipClass}`}>
            {answer.review === "accepted" && <Check aria-hidden className="wa-icon wa-icon--sm" />}
            {answer.review === "edited" && <Pencil aria-hidden className="wa-icon wa-icon--sm" />}
            {answer.review === "rejected" && <X aria-hidden className="wa-icon wa-icon--sm" />}
            {chipText}
          </span>
        </div>
        {editing === answer.field_key ? (
          <form className="wa-field" onSubmit={(event) => { event.preventDefault(); decide(answer.field_key, "edit", draft); }}>
            <label className="wa-label" htmlFor={`e-${answer.field_key}`}>Your answer</label>
            <textarea id={`e-${answer.field_key}`} className="wa-input wa-textarea" value={draft} maxLength={4000}
              onChange={(event) => setDraft(event.target.value)} autoFocus />
            <div className="wa-actions">
              <button type="submit" className="wa-button wa-button--secondary wa-button--small" disabled={busy || !draft.trim()}>Save</button>
              <button type="button" className="wa-button wa-button--quiet wa-button--small" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <p className="wa-answer__text">{empty ? "Not discussed in the conversation." : text}</p>
        )}
        {field?.mode === "suggest" && !empty && answer.review === "unreviewed" && (
          <p className="wa-hint">Watson&apos;s reading of the conversation, not a diagnosis. Accept it only if it is your assessment.</p>
        )}
        {quotes.length > 0 && (
          <ul className="wa-quotes" aria-label="From the conversation">
            {quotes.map((segment) => (
              <li key={segment.position} className={`wa-quote wa-quote--${segment.speaker}`}>
                <div>
                  <span className="wa-quote__who">{segment.speaker === "patient" ? "Patient" : "Practitioner"} · {clock(Number(segment.start_seconds))}</span>
                  <p className="wa-quote__text">{segment.reviewed_text ?? segment.machine_text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!approved && editing !== answer.field_key && (
          <div className="wa-actions">
            {empty ? (
              <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy} onClick={() => edit(answer)}>
                <Plus aria-hidden className="wa-icon wa-icon--sm" />Add an answer
              </button>
            ) : settled ? (
              <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy}
                onClick={() => decide(answer.field_key, "undo")}>Change</button>
            ) : (
              <>
                <button type="button" className="wa-button wa-button--secondary wa-button--small" disabled={busy}
                  onClick={() => decide(answer.field_key, "accept")}><Check aria-hidden className="wa-icon wa-icon--sm" />Accept</button>
                <button type="button" className="wa-button wa-button--secondary wa-button--small" disabled={busy}
                  onClick={() => edit(answer)}><Pencil aria-hidden className="wa-icon wa-icon--sm" />Edit</button>
                <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy}
                  onClick={() => decide(answer.field_key, "reject")}>Reject</button>
              </>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <>
      {back}
      <div className="wa-pagehead">
        <div className="wa-pagehead__text">
          <h1 className="wa-title">{consultation.synthetic_patient_ref}</h1>
          <p className="wa-meta">{template.title} · filled in by Watson from the conversation of {dateTime(consultation.scheduled_at)}</p>
        </div>
      </div>
      <ul className="wa-facts">
        <li>{answered} of {answers.length} answered</li>
        <li>{answers.length - answered} not discussed</li>
        {suggestions > 0 && <li>{suggestions} {suggestions === 1 ? "suggestion" : "suggestions"}</li>}
      </ul>
      {approved ? (
        <Notice title={`Approved ${form.approved_at ? dateTime(form.approved_at) : ""}`}>This form is final. It is the record of the consultation.</Notice>
      ) : (
        <div className="wa-notice">
          <Info aria-hidden className="wa-icon" />
          <div className="wa-notice__body">
            <p className="wa-notice__title">Check every answer against its quote</p>
            <p className="wa-text">Watson wrote these from the transcript. Accept, edit or reject each one, then approve the form. Nothing is final until you approve.</p>
          </div>
        </div>
      )}
      {problem && <Notice tone="failed" title="That did not work">{problem}</Notice>}
      <div className="wa-sheet">
        {template.sections.map((section, index) => (
          <section key={section.title} className="wa-sheet__section" aria-labelledby={`s-${index}`}>
            <h2 className="wa-sheet__title" id={`s-${index}`}>{section.title}</h2>
            {section.fields.map((field) => byKey.get(field.key)).filter((answer) => answer !== undefined).map(card)}
          </section>
        ))}
      </div>
      {!approved && (
        <div className="wa-approve">
          <p className="wa-meta" role="status">
            {toCheck === 0 ? "Every answer is checked." : `${toCheck} ${toCheck === 1 ? "answer" : "answers"} still to check`}
          </p>
          <button type="button" className="wa-button wa-button--primary" disabled={busy || toCheck > 0} onClick={approve}>
            Approve form
          </button>
        </div>
      )}
    </>
  );
}
