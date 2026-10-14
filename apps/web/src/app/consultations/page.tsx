"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice, StatusChip } from "@/components/status";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { dateTime, GROUPS, LANGUAGE_LABEL, summarise } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Row = Pick<Tables<"consultations">, "id" | "synthetic_patient_ref" | "scheduled_at" | "language" | "status" | "scenario_notes">;

export default function ConsultationsPage() {
  return <RequireSession>{(user) => <AppShell user={user}><ConsultationList /></AppShell>}</RequireSession>;
}

function ConsultationList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Row-level security returns only the signed-in practitioner's consultations.
    supabase
      .from("consultations")
      .select("id, synthetic_patient_ref, scheduled_at, language, status, scenario_notes")
      .order("scheduled_at", { ascending: false })
      .then(({ data, error }) => (error ? setFailed(true) : setRows(data)));
  }, []);

  const needYou = rows?.filter((row) => summarise(row.status).group === "Needs you").length ?? 0;
  return (
    <>
      <div className="wa-pagehead">
        <div className="wa-pagehead__text">
          <h1 className="wa-title">Consultations</h1>
          {needYou > 0 && <p className="wa-meta">{needYou} {needYou === 1 ? "needs" : "need"} you</p>}
        </div>
        <Link href="/consultations/new/" className="wa-button wa-button--primary">
          <Plus aria-hidden className="wa-icon" />New consultation
        </Link>
      </div>
      {failed ? (
        <Notice tone="failed" title="Your consultations could not be loaded">Check your connection and reload the page.</Notice>
      ) : rows === null ? (
        <ul className="wa-list" aria-busy="true" aria-label="Your consultations">
          <li className="wa-hidden">Loading your consultations</li>
          {[96, 180, 140].map((width) => (
            <li key={width} className="wa-row" aria-hidden>
              <span className="wa-row__main" style={{ gap: 8 }}>
                <span className="wa-skeleton" style={{ width: 96 }} /><span className="wa-skeleton" style={{ width: width + 80 }} />
              </span>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="wa-list">
          <div className="wa-empty">
            <h2 className="wa-heading">No consultations yet</h2>
            <p className="wa-text">Create one to attach its two audio tracks and get a transcript.</p>
            <Link href="/consultations/new/" className="wa-button wa-button--primary">
              <Plus aria-hidden className="wa-icon" />New consultation
            </Link>
          </div>
        </div>
      ) : (
        <ul className="wa-list" aria-label="Your consultations">
          {GROUPS.map((group) => {
            const members = rows.filter((row) => summarise(row.status).group === group);
            return members.length === 0 ? null : [
              <li key={group} className="wa-list__group"><span>{group}</span><span>{members.length}</span></li>,
              ...members.map((row) => (
                <li key={row.id}>
                  <Link href={`/consultation/?id=${row.id}`} className="wa-row">
                    <span className="wa-row__main">
                      <span className="wa-row__ref">{row.synthetic_patient_ref}</span>
                      <span className="wa-row__meta">{dateTime(row.scheduled_at)} · {LANGUAGE_LABEL[row.language]}</span>
                      {row.scenario_notes && <span className="wa-row__note">{row.scenario_notes}</span>}
                    </span>
                    <StatusChip status={row.status} />
                    <ChevronRight aria-hidden className="wa-icon" />
                  </Link>
                </li>
              )),
            ];
          })}
        </ul>
      )}
    </>
  );
}
