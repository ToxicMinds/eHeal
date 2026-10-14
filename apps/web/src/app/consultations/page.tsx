"use client";

import { ArrowRight, Plus, Server } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { euros } from "@/components/patient-panel";
import { Notice, StatusChip } from "@/components/status";
import type { ConsultationStatus } from "@/lib/status";
import { dateTime, LANGUAGE_LABEL, summarise } from "@/lib/status";
import { RequireSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Row = {
  id: string; synthetic_patient_ref: string; scheduled_at: string; updated_at: string;
  language: keyof typeof LANGUAGE_LABEL; status: ConsultationStatus;
  fee_cents: number | null; paid_at: string | null;
  forms: { form_answers: { machine_text: string | null }[] }[];
  patients: { name: string } | null;
};
/** The patient's name once known, else the consultation's reference. */
const who = (row: Row) => row.patients?.name ?? row.synthetic_patient_ref;
type Engine = { online: boolean; last_seen_at: string | null };

export default function ConsultationsPage() {
  return <RequireSession>{(user) => <AppShell user={user}><Dashboard /></AppShell>}</RequireSession>;
}

/** What the practitioner does next, on the card. */
const NEXT: Partial<Record<ConsultationStatus, string>> = {
  consent_pending: "Record the patient's consent",
  ready_for_audio: "Start the call, or add its recordings",
  audio_imported: "Start the transcript",
  transcription_processing: "Watson is writing the transcript",
  transcription_failed: "The transcript stopped. Try again.",
  transcript_ready: "Fill in the form",
  transcript_under_review: "Finish checking the transcript",
  transcript_reviewed: "Fill in the form",
  extraction_processing: "Watson is reading the conversation",
  extraction_failed: "The form stopped. Try again.",
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
const plural = (n: number, one: string, many: string) => `${n === 1 ? "One" : n} ${n === 1 ? one : many}`;

function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Row-level security returns only the signed-in practitioner's consultations.
    supabase
      .from("consultations")
      .select("id, synthetic_patient_ref, scheduled_at, updated_at, language, status, fee_cents, paid_at, forms(form_answers(machine_text)), patients(name)")
      .order("scheduled_at", { ascending: false })
      .then(({ data, error }) => (error ? setFailed(true) : setRows(data as unknown as Row[])));
    supabase.rpc("engine_status").then(({ data }) => setEngine(data as Engine | null));
  }, []);

  const now = new Date();
  const group = (name: string) => rows?.filter((row) => summarise(row.status).group === name) ?? [];
  const needYou = group("Needs you");
  const working = group("Watson is working");
  const done = group("Done");
  const today = rows?.filter((row) => new Date(row.scheduled_at).toDateString() === now.toDateString()).length ?? 0;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const approved = done.filter((row) => ["approved", "corrected"].includes(row.status) && Date.parse(row.updated_at) > weekAgo).length;
  const lastReport = engine?.last_seen_at ? Math.max(0, Math.round((now.getTime() - Date.parse(engine.last_seen_at)) / 1000)) : null;

  const summary = rows === null ? " " : [
    needYou.length ? `${plural(needYou.length, "consultation needs", "consultations need")} you.` : "Nothing needs you right now.",
    working.length ? `Watson is working on ${working.length === 1 ? "one" : working.length}.` : "",
  ].join(" ");

  return (
    <>
      <section className="wa-hero" aria-labelledby="greeting">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <p className="wa-hero__eyebrow">{DAY.format(now)}</p>
            <h1 className="wa-hero__title" id="greeting">{greeting(now.getHours())}</h1>
            <p className="wa-hero__meta">{summary}</p>
          </div>
          <Link href="/consultations/new/" className="wa-button wa-button--primary">
            <Plus aria-hidden className="wa-icon" />New consultation
          </Link>
        </div>
        {rows && rows.length > 0 && (
          <div className="wa-stats">
            <a className="wa-stat wa-stat--lamp" href="#needs"><span className="wa-stat__value">{needYou.length}</span><span className="wa-stat__label">Need you</span></a>
            <a className="wa-stat" href="#working"><span className="wa-stat__value">{working.length}</span><span className="wa-stat__label">Watson is working</span></a>
            <span className="wa-stat"><span className="wa-stat__value">{today}</span><span className="wa-stat__label">Booked today</span></span>
            <a className="wa-stat" href="#done"><span className="wa-stat__value">{approved}</span><span className="wa-stat__label">Approved this week</span></a>
          </div>
        )}
      </section>

      {failed ? (
        <Notice tone="failed" title="Your consultations could not be loaded">Check your connection and reload the page.</Notice>
      ) : rows === null ? (
        <div className="wa-cases" aria-busy="true" aria-label="Loading your consultations">
          {[0, 1].map((key) => (
            <div key={key} className="wa-case" aria-hidden>
              <span className="wa-skeleton" style={{ width: 120 }} /><span className="wa-skeleton" style={{ width: 200 }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="wa-list">
          <div className="wa-empty">
            <h2 className="wa-heading">No consultations yet</h2>
            <p className="wa-text">Create one, send the patient their link, and meet them by video. Watson writes the transcript and fills in your form.</p>
            <Link href="/consultations/new/" className="wa-button wa-button--primary">
              <Plus aria-hidden className="wa-icon" />New consultation
            </Link>
          </div>
        </div>
      ) : (
        <>
          {needYou.length > 0 && (
            <section className="wa-shelf" aria-labelledby="needs">
              <div className="wa-shelf__head"><h2 className="wa-heading" id="needs">Needs you</h2></div>
              <div className="wa-cases">{needYou.map((row) => <Case key={row.id} row={row} />)}</div>
            </section>
          )}
          {working.length > 0 && (
            <section className="wa-shelf" aria-labelledby="working">
              <div className="wa-shelf__head">
                <h2 className="wa-heading" id="working">Watson is working</h2>
                <p className="wa-engine" style={{ margin: 0 }}>
                  <Server aria-hidden className="wa-icon wa-icon--sm" />
                  {engine?.online ? `Engine online${lastReport === null ? "" : ` · last report ${lastReport} s ago`}` : "Engine offline: work waits until it is back"}
                </p>
              </div>
              <div className="wa-cases">{working.map((row) => <Case key={row.id} row={row} />)}</div>
            </section>
          )}
          {done.length > 0 && (
            <section className="wa-shelf" aria-labelledby="done">
              <div className="wa-shelf__head"><h2 className="wa-heading" id="done">Done</h2></div>
              <ul className="wa-done-list">
                {done.map((row) => (
                  <li key={row.id}>
                    <Link href={`/consultation/?id=${row.id}`} className="wa-row__ref" style={{ color: "inherit" }}>{who(row)}</Link>
                    <span className="wa-meta">{dateTime(row.scheduled_at)} · {LANGUAGE_LABEL[row.language]}</span>
                    <span style={{ marginLeft: "auto" }}><StatusChip status={row.status} /></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Case({ row }: { row: Row }) {
  const { tone, stages } = summarise(row.status);
  const answers = row.forms[0]?.form_answers ?? [];
  const answered = answers.filter((answer) => answer.machine_text !== null).length;
  const formReady = row.status === "draft_ready" || row.status === "under_review";
  const next = formReady ? `${answered} of ${answers.length} answered by Watson` : NEXT[row.status] ?? "";
  const fee = row.fee_cents === null ? null : row.paid_at ? `Paid ${euros(row.fee_cents)}` : "Not paid yet";
  const edge = tone === "failed" ? "wa-case--failed" : tone === "working" ? "wa-case--working" : "wa-case--attention";
  return (
    <Link href={formReady ? `/form/?id=${row.id}` : `/consultation/?id=${row.id}`} className={`wa-case ${edge}`}>
      <div className="wa-case__top">
        <span className={row.patients ? "wa-case__name" : "wa-case__ref"}>{who(row)}</span>
        <StatusChip status={row.status} />
      </div>
      <p className="wa-case__meta">{[dateTime(row.scheduled_at), LANGUAGE_LABEL[row.language], fee].filter(Boolean).join(" · ")}</p>
      <div className="wa-dots" aria-hidden>
        {stages.map((state, index) => <span key={index} className={state === "pending" ? undefined : `is-${state}`} />)}
      </div>
      <p className="wa-case__next">{next}</p>
      <span className="wa-button wa-button--secondary wa-button--small" style={{ justifySelf: "start" }}>
        {formReady ? "Check the form" : "Open"}<ArrowRight aria-hidden className="wa-icon wa-icon--sm" />
      </span>
    </Link>
  );
}
