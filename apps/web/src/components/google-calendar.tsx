"use client";

import { CalendarDays, Check, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/status";
import type { GoogleLink } from "@/lib/booking";
import { google, GOOGLE_PROBLEM } from "@/lib/google";
import { dateTime } from "@/lib/status";

// The practitioner's Google Calendar on the calendar page (design system: ScreenCalendar,
// ScreenCalendarConnect). Google's keys never reach the browser; the `google` edge function acts.

const UNREACHABLE = "Google Calendar cannot be reached from Watson right now. Try again in a few minutes.";

function WhatWatsonSees() {
  return (
    <ul className="wa-promise">
      <li><EyeOff aria-hidden className="wa-icon" /><span>Watson sees only <strong>when</strong> you are busy, never what your events are.</span></li>
      <li><CalendarDays aria-hidden className="wa-icon" /><span>Bookings appear in your Google Calendar, in a calendar called <strong>Watson</strong>.</span></li>
      <li><ShieldCheck aria-hidden className="wa-icon" /><span>You can disconnect at any time, here or in your Google account.</span></li>
    </ul>
  );
}

/** Before Google is connected: what connecting does, and the button. */
export function GoogleConnect() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function connect() {
    setBusy(true);
    setProblem(null);
    const answer = await google("connect");
    if (answer?.url) return window.location.assign(answer.url);
    setBusy(false);
    setProblem(UNREACHABLE);
  }
  return (
    <section className="wa-panel" aria-labelledby="connect" style={{ borderTop: "4px solid var(--practitioner)" }}>
      <div className="wa-panel__head"><h2 className="wa-heading" id="connect">See your Google Calendar here</h2></div>
      <p className="wa-text">Connect it, and patients can only book times when you are free. Until then they can book any open time in your hours, even if you are busy elsewhere.</p>
      <WhatWatsonSees />
      <div className="wa-actions">
        <button type="button" className="wa-button wa-button--primary" onClick={connect} disabled={busy} aria-busy={busy || undefined}>
          <CalendarDays aria-hidden className="wa-icon" />Connect Google Calendar
        </button>
      </div>
      <p className="wa-hint">Google will ask you to choose your account and allow Watson to see when you are free.</p>
      {problem && <Notice tone="failed" title="Not connected">{problem}</Notice>}
    </section>
  );
}

/** Once connected: one line above the week, with a way to read Google again now. */
export function GoogleLine({ link, onChecked }: { link: GoogleLink; onChecked: () => void }) {
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    await google("refresh");
    setBusy(false);
    onChecked();
  }
  return (
    <>
      <div className="wa-linked">
        <CalendarDays aria-hidden className="wa-icon" />
        <span><strong>Google Calendar connected</strong> · {link.email}{link.checked_at && ` · checked ${dateTime(link.checked_at)}`}</span>
        <button type="button" className="wa-button wa-button--quiet wa-button--small" onClick={check} disabled={busy} aria-busy={busy || undefined}>
          <RefreshCw aria-hidden className="wa-icon wa-icon--sm" />Check now
        </button>
      </div>
      {link.problem && <Notice tone="attention" title="Your Google Calendar was not read">{GOOGLE_PROBLEM[link.problem]}</Notice>}
    </>
  );
}

/** Once connected: what Watson does with it, and how to stop. */
export function GooglePanel({ onDisconnected }: { onDisconnected: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function disconnect() {
    setBusy(true);
    const answer = await google("disconnect");
    setBusy(false);
    if (answer?.ok) onDisconnected();
    else setProblem(UNREACHABLE);
  }
  return (
    <section className="wa-panel" aria-labelledby="google">
      <div className="wa-panel__head">
        <h2 className="wa-heading" id="google">Google Calendar</h2>
        <span className="wa-chip wa-chip--done"><Check aria-hidden className="wa-icon wa-icon--sm" />Connected</span>
      </div>
      <WhatWatsonSees />
      <div className="wa-actions">
        <button type="button" className="wa-button wa-button--quiet wa-button--small" onClick={disconnect} disabled={busy}>Disconnect</button>
      </div>
      {problem && <Notice tone="failed" title="Still connected">{problem}</Notice>}
    </section>
  );
}
