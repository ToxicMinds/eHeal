"use client";

import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LaptopLine } from "@/components/laptop";
import { Notice } from "@/components/status";
import { engineStatus, type Engine } from "@/lib/engine";
import { call, explain } from "@/lib/api";
import { clock } from "@/lib/audio";
import type { Database, Tables } from "@/lib/database.types";
import type { ConsultationStatus } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Job = Tables<"transcription_jobs">;
type Stage = "queued" | Database["public"]["Enums"]["job_stage"];

const STAGES: readonly [Stage, string][] = [
  ["queued", "Waiting for the engine"],
  ["validating", "Checking the audio"],
  ["transcribing_practitioner", "Transcribing the practitioner track"],
  ["transcribing_patient", "Transcribing the patient track"],
  ["merging", "Putting the turns in order"],
];

/** What went wrong, in the practitioner's words, and what to do about it. */
function failure(category: string, speaker: string | null): { title: string; text: string } {
  const track = speaker ? `The ${speaker} track` : "A track";
  switch (category) {
    case "AUDIO_CORRUPT":
      return { title: `${track} could not be read`, text: "The file is damaged, or it is not the one that was attached. Replace it, then try again." };
    case "AUDIO_DURATION_INVALID":
      return { title: `${track} is empty or longer than two hours`, text: "Replace it, then try again." };
    case "AUDIO_FILE_MISSING":
      return { title: `${track} is missing`, text: "Attach it again, then try again." };
    case "AUDIO_FORMAT_UNSUPPORTED":
    case "AUDIO_TOO_LARGE":
      return { title: `${track} cannot be used`, text: explain(category) };
    case "ENGINE_STALLED":
      return { title: "The engine stopped three times", text: "The computer running it may have gone to sleep. Try again; if it happens again, check that the engine is running." };
    case "TRANSCRIPTION_TIMEOUT":
      return { title: "Transcription took too long", text: "Try again. Long recordings take longer on a busy computer." };
    case "TRANSCRIPTION_MODEL_UNAVAILABLE":
      return { title: "The engine's speech model is missing", text: "Try again once the model is installed on the engine's computer." };
    default:
      return { title: "Transcription did not finish", text: "Try again. Nothing was lost." };
  }
}

/** Transcription as it happens: each stage, the time so far, and whether an engine is there to do it. */
export function JobPanel({ consultationId, status, onChanged }: {
  consultationId: string;
  status: ConsultationStatus;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const read = useCallback(async () => {
    const [jobs, engine] = await Promise.all([
      supabase.from("transcription_jobs").select("*").eq("consultation_id", consultationId)
        .order("queued_at", { ascending: false }).limit(1).maybeSingle(),
      engineStatus(),
    ]);
    return { latest: jobs.data, engine };
  }, [consultationId]);

  useEffect(() => {
    let alive = true;
    const show = ({ latest, engine: seen }: Awaited<ReturnType<typeof read>>) => {
      if (!alive) return;
      setJob(latest);
      setEngine(seen);
      setNow(Date.now());
      if (latest && status === "transcription_processing" && latest.status !== "queued" && latest.status !== "processing") onChanged();
    };
    read().then(show);
    if (status !== "transcription_processing") return;
    // Polled, not pushed: a few small reads while a job runs.
    const poll = setInterval(() => read().then(show), 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [status, read, onChanged]);

  async function act(name: "start_transcription" | "cancel_transcription") {
    setBusy(true);
    setProblem(null);
    const outcome = await call(name, { p_consultation_id: consultationId });
    setBusy(false);
    if (!outcome.ok) setProblem(explain(outcome.error_category));
    onChanged();
  }

  if (job === undefined) return <p className="wa-meta" role="status">Loading the transcription…</p>;

  if (status === "transcription_failed" && job) {
    const speaker = job.failed_speaker === "practitioner" ? "practitioner" : job.failed_speaker === "patient" ? "patient" : null;
    const { title, text } = failure(job.error_category ?? "", speaker);
    return (
      <>
        <Notice tone="failed" title={title} actions={
          <button type="button" className="wa-button wa-button--primary" disabled={busy} onClick={() => act("start_transcription")}>
            <RotateCcw aria-hidden className="wa-icon" />Try again
          </button>
        }>
          {text}
        </Notice>
        {problem && <p className="wa-error" role="alert">{problem}</p>}
      </>
    );
  }
  if (!job) return null;

  const queuedFor = (job.claimed_at ? Date.parse(job.claimed_at) : now) - Date.parse(job.queued_at);
  const current = job.status === "queued" ? 0 : Math.max(1, STAGES.findIndex(([stage]) => stage === (job.stage ?? "validating")));

  return (
    <section className="wa-panel" aria-labelledby="job-title">
      <div className="wa-job__head">
        <h2 className="wa-heading" id="job-title">Transcribing</h2>
        <span className="wa-job__clock">{clock((now - Date.parse(job.queued_at)) / 1000)} so far</span>
      </div>
      <div className="wa-bar" role="presentation" />
      <ol className="wa-stages">
        {STAGES.map(([stage, label], index) => (
          <li key={stage} className={index < current ? "wa-stage wa-stage--done" : index === current ? "wa-stage wa-stage--current" : "wa-stage"}
            aria-current={index === current ? "step" : undefined}>
            {index < current ? <Check aria-hidden className="wa-icon" />
              : index === current ? <LoaderCircle aria-hidden className="wa-icon wa-spin" />
              : <span className="wa-stage__dot" aria-hidden />}
            <span>{label}</span>
            <span className="wa-stage__time">{index === 0 && current > 0 ? clock(queuedFor / 1000) : ""}</span>
          </li>
        ))}
      </ol>
      <LaptopLine engine={engine} now={now}
        waiting="Your consultation is in line and starts as soon as the laptop is back. Nothing is lost while you wait." />
      <p className="wa-hint">You can leave this page. The transcript appears here when it is ready.</p>
      {job.status === "queued" && (
        <div className="wa-actions">
          <button type="button" className="wa-button wa-button--secondary" disabled={busy} onClick={() => act("cancel_transcription")}>
            Cancel transcription
          </button>
        </div>
      )}
      {problem && <p className="wa-error" role="alert">{problem}</p>}
    </section>
  );
}
