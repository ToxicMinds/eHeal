"use client";

import { ChevronLeft, Video } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AudioSlot } from "@/components/audio-slot";
import { DocumentsPanel } from "@/components/documents-panel";
import { FormPanel } from "@/components/form-panel";
import { JobPanel } from "@/components/job-panel";
import { euros, PatientPanel } from "@/components/patient-panel";
import { Journey, Notice } from "@/components/status";
import { TranscriptView } from "@/components/transcript-view";
import { call, explain } from "@/lib/api";
import { clock, humanSize } from "@/lib/audio";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { dateTime, dayMonth, LANGUAGE_LABEL, summarise } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Consultation = Tables<"consultations">;
type Track = Tables<"audio_tracks">;
type Patient = Pick<Tables<"patients">, "id" | "name" | "phone" | "email">;
type Loaded = { consultation: Consultation; tracks: Track[]; audioLeft: boolean; patient: Patient | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPEAKERS = ["practitioner", "patient"] as const;
const FORM_STATUSES = ["transcript_ready", "transcript_reviewed", "extraction_processing", "extraction_failed",
  "draft_ready", "under_review", "approved"];
const AUDIO_CAN_CHANGE = ["ready_for_audio", "audio_imported", "transcription_failed"];
const HAS_TRANSCRIPT = ["transcript_ready", "transcript_under_review", "transcript_reviewed", "extraction_processing",
  "extraction_failed", "draft_ready", "under_review", "approved", "corrected", "archived"];

export default function ConsultationPage() {
  return (
    <RequireSession>
      {(user) => (
        <AppShell user={user}>
          <Suspense fallback={<p className="wa-meta" role="status">Loading the consultation…</p>}>
            <ConsultationView userId={user.id} />
          </Suspense>
        </AppShell>
      )}
    </RequireSession>
  );
}

const back = (
  <Link href="/consultations/" className="wa-crumb"><ChevronLeft aria-hidden className="wa-icon wa-icon--sm" />Consultations</Link>
);

/** What each of the four steps says under its bar. */
function stepLines({ consultation, tracks }: Loaded): string[] {
  const { stages } = summarise(consultation.status);
  const missing = SPEAKERS.filter((speaker) => !tracks.some((track) => track.speaker === speaker));
  return [
    consultation.consent_withdrawn_at ? `Withdrawn ${dayMonth(consultation.consent_withdrawn_at)}`
      : consultation.consent_recorded_at ? `Recorded ${dayMonth(consultation.consent_recorded_at)}` : "Not recorded yet",
    stages[1] === "done" ? "Both tracks attached" : stages[1] === "current"
      ? missing.length === 2 ? "Waiting for both tracks" : `Waiting for the ${missing[0]} track` : "Not yet",
    { current: consultation.status === "transcription_processing" ? "Transcribing" : "Ready to start", failed: "Failed", done: "Done" }[
      stages[2] as "current" | "failed" | "done"] ?? "Not yet",
    ({ transcript_ready: "Not set up", transcript_reviewed: "Not set up", extraction_processing: "Filling in",
      extraction_failed: "Failed", draft_ready: "Ready to check", under_review: "Checking", approved: "Approved" } as Record<string, string>)[
      consultation.status] ?? "Not yet",
  ];
}

function ConsultationView({ userId }: { userId: string }) {
  const id = useSearchParams().get("id") ?? "";
  const [loaded, setLoaded] = useState<Loaded | "missing" | "failed" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchAll = useCallback(async (): Promise<Loaded | "missing" | "failed"> => {
    const [consultation, tracks] = await Promise.all([
      supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
      supabase.from("audio_tracks").select("*").eq("consultation_id", id),
    ]);
    if (consultation.error || tracks.error) return "failed";
    if (!consultation.data) return "missing";
    // After a withdrawal, files that could not be deleted are offered for deletion again.
    const files = consultation.data.status === "consent_withdrawn"
      ? (await supabase.storage.from("audio").list(`${userId}/${id}`)).data ?? [] : [];
    const patient = consultation.data.patient_id
      ? (await supabase.from("patients").select("id, name, phone, email").eq("id", consultation.data.patient_id).maybeSingle()).data
      : null;
    return { consultation: consultation.data, tracks: tracks.data, audioLeft: files.length > 0, patient };
  }, [id, userId]);
  const load = useCallback(() => {
    fetchAll().then(setLoaded);
  }, [fetchAll]);

  useEffect(() => {
    if (!UUID.test(id)) return;
    let current = true;
    fetchAll().then((result) => current && setLoaded(result));
    return () => {
      current = false;
    };
  }, [id, fetchAll]);

  if (!UUID.test(id) || loaded === "missing") {
    return <>{back}<p className="wa-text">This consultation does not exist, or it is not yours.</p></>;
  }
  if (loaded === "failed") {
    return <>{back}<Notice tone="failed" title="The consultation could not be loaded">Check your connection and reload the page.</Notice></>;
  }
  if (loaded === null) return <p className="wa-meta" role="status">Loading the consultation…</p>;

  const { consultation, tracks, audioLeft, patient } = loaded;
  const status = consultation.status;
  const editable = consultation.consent_recorded_at !== null && AUDIO_CAN_CHANGE.includes(status);
  const both = tracks.length === 2;
  const language = LANGUAGE_LABEL[consultation.language];

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    await step();
    setBusy(false);
    load();
  }
  const perform = (name: "record_consent" | "start_transcription") => run(async () => {
    const outcome = await call(name, { p_consultation_id: consultation.id });
    if (!outcome.ok) setProblem(explain(outcome.error_category));
  });
  const declare = (recordedTogether: boolean) => run(async () => {
    const outcome = await call("declare_recorded_together", {
      p_consultation_id: consultation.id, p_recorded_together: recordedTogether,
    });
    if (!outcome.ok) setProblem(explain(outcome.error_category));
  });
  async function deleteAudio() {
    await supabase.storage.from("audio").remove(SPEAKERS.map((speaker) => `${userId}/${consultation.id}/${speaker}`));
    await call("confirm_audio_deleted", { p_consultation_id: consultation.id });
  }
  const withdraw = () => run(async () => {
    const outcome = await call("withdraw_consent", { p_consultation_id: consultation.id });
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    setConfirming(false);
    await deleteAudio();
  });

  const canWithdraw = consultation.consent_recorded_at !== null && status !== "consent_withdrawn";

  return (
    <>
      {back}
      <div className="wa-pagehead">
        <div className="wa-pagehead__text">
          <h1 className="wa-title">{patient?.name ?? consultation.synthetic_patient_ref}</h1>
          <p className="wa-meta">
            {dateTime(consultation.scheduled_at)} · {language}
            {patient && ` · ${patient.phone ?? patient.email}`}
            {consultation.fee_cents !== null && ` · Fee ${euros(consultation.fee_cents)}`}
            {consultation.scenario_notes && ` · ${consultation.scenario_notes}`}
          </p>
        </div>
        {canWithdraw && !confirming && (
          <button type="button" className="wa-button wa-button--danger wa-button--small" onClick={() => setConfirming(true)}>
            Withdraw consent
          </button>
        )}
      </div>
      {confirming && (
        <Notice tone="attention" title="Withdraw consent?" actions={<>
          <button type="button" className="wa-button wa-button--danger" disabled={busy} onClick={withdraw}>Withdraw consent</button>
          <button type="button" className="wa-button wa-button--secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep consent</button>
        </>}>
          Any transcription stops, and both audio tracks and the transcript are deleted. This cannot be undone.
        </Notice>
      )}

      <Journey status={status} lines={stepLines(loaded)} />
      {problem && <Notice tone="failed" title="That did not work">{problem}</Notice>}

      {["consent_pending", "ready_for_audio"].includes(status) && tracks.length === 0 && (
        <section className="wa-panel" aria-labelledby="call-title">
          <h2 className="wa-heading" id="call-title">Consultation call</h2>
          <p className="wa-text">Talk to the patient by video. Both voices are recorded and transcribed when you end the call.</p>
          <div className="wa-actions">
            <Link href={`/room/?id=${consultation.id}`} className="wa-button wa-button--primary">
              <Video aria-hidden className="wa-icon" />Start video call
            </Link>
          </div>
        </section>
      )}

      {status === "consent_pending" && (
        <section className="wa-panel" aria-labelledby="consent-title">
          <h2 className="wa-heading" id="consent-title">Consent</h2>
          <p className="wa-text">Consent to transcription is not recorded yet. Without it, no audio can be attached or transcribed.</p>
          <div className="wa-actions">
            <button type="button" className="wa-button wa-button--primary" disabled={busy} onClick={() => perform("record_consent")}>Record consent</button>
          </div>
        </section>
      )}

      {status === "consent_withdrawn" && (
        audioLeft ? (
          <Notice tone="attention" title="Audio not yet deleted" actions={
            <button type="button" className="wa-button wa-button--primary" disabled={busy} onClick={() => run(deleteAudio)}>Delete audio now</button>
          }>
            Consent was withdrawn, but the audio files are still stored. Delete them now.
          </Notice>
        ) : (
          <Notice title="Consent was withdrawn">The audio tracks and any transcript of this consultation are deleted.</Notice>
        )
      )}

      {(status === "transcription_processing" || status === "transcription_failed") && (
        <JobPanel consultationId={consultation.id} status={status} onChanged={load} />
      )}

      {FORM_STATUSES.includes(status) && <FormPanel consultationId={consultation.id} status={status} onChanged={load} />}

      {status !== "consent_withdrawn" && <PatientPanel consultation={consultation} patient={patient} />}

      {status !== "consent_withdrawn" && <DocumentsPanel consultationId={consultation.id} patient={patient} onChanged={load} />}

      {HAS_TRANSCRIPT.includes(status) && <TranscriptView consultationId={consultation.id} language={language} />}

      {AUDIO_CAN_CHANGE.includes(status) && (
        <section className="wa-panel" aria-labelledby="audio-title">
          <div className="wa-panel__head">
            <h2 className="wa-heading" id="audio-title">Audio</h2>
            <span className="wa-hint">One track for each speaker</span>
          </div>
          <div className="wa-slots">
            {SPEAKERS.map((speaker) => (
              <AudioSlot key={speaker} speaker={speaker} track={tracks.find((track) => track.speaker === speaker)}
                consultationId={consultation.id} userId={userId} editable={editable} onChanged={load} />
            ))}
          </div>
          <label className="wa-check">
            <input type="checkbox" checked={consultation.recorded_together} disabled={!editable || busy}
              onChange={(event) => declare(event.target.checked)} />
            <span className="wa-check__text">
              <span className="wa-check__label">Both tracks were recorded together and start at the same moment</span>
              <span className="wa-hint">Leave this off if you are not sure. The transcript then shows the order of turns as a best guess and says so.</span>
            </span>
          </label>
          {status !== "transcription_failed" && (
            <div className="wa-actions">
              <button type="button" className="wa-button wa-button--primary" disabled={!both || busy}
                aria-busy={busy || undefined} onClick={() => perform("start_transcription")}>
                Start transcription
              </button>
              {!both && (
                <p className="wa-hint">
                  {tracks.length === 0 ? "Attach both tracks first." : `Attach the ${tracks[0].speaker === "patient" ? "practitioner" : "patient"} track first.`}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {(status === "transcription_processing" || HAS_TRANSCRIPT.includes(status)) && tracks.length > 0 && (
        <aside className="wa-aside" aria-labelledby="audio-summary">
          <h2 className="wa-heading" id="audio-summary">Audio</h2>
          <ul className="wa-facts" style={{ display: "grid", gap: 4 }}>
            {SPEAKERS.map((speaker) => {
              const track = tracks.find((candidate) => candidate.speaker === speaker);
              return track && (
                <li key={speaker}>
                  <strong className={speaker === "patient" ? "wa-voice--patient" : "wa-voice--practitioner"}>
                    {speaker === "patient" ? "Patient" : "Practitioner"}
                  </strong>
                  {track.duration_seconds !== null && ` · ${clock(track.duration_seconds)}`} · {track.format.toUpperCase()} · {humanSize(track.size_bytes)}
                </li>
              );
            })}
            <li>{consultation.recorded_together ? "Recorded together" : "Recorded separately"}</li>
          </ul>
        </aside>
      )}
    </>
  );
}
