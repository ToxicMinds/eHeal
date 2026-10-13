"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { call, explain } from "@/lib/api";
import {
  clock, durationOf, formatOfFile, formatOfRecording, humanSize, MAX_BYTES, MAX_SECONDS,
  mimeOf, sha256Hex, type AudioFormat,
} from "@/lib/audio";
import type { Database, Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type Speaker = Database["public"]["Enums"]["speaker"];
type Take = { blob: Blob; format: AudioFormat; seconds: number; url: string };

const VOICE: Record<Speaker, { name: string; edge: string; ink: string }> = {
  practitioner: { name: "Practitioner", edge: "border-l-practitioner", ink: "text-practitioner" },
  patient: { name: "Patient", edge: "border-l-patient", ink: "text-patient" },
};

/** One speaker's audio: attach a file or a recording, see what was attached, remove it. */
export function TrackCard({
  speaker, track, consultationId, userId, editable, blockedReason, onChanged,
}: {
  speaker: Speaker;
  track: Tables<"audio_tracks"> | undefined;
  consultationId: string;
  userId: string;
  editable: boolean;
  blockedReason: string | null;
  onChanged: () => void;
}) {
  const voice = VOICE[speaker];
  const path = `${userId}/${consultationId}/${speaker}`;
  const [phase, setPhase] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (elapsed === null) return;
    const timer = setInterval(() => setElapsed((seconds) => (seconds === null ? null : seconds + 1)), 1000);
    return () => clearInterval(timer);
  }, [elapsed === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function attach(blob: Blob, format: AudioFormat, knownSeconds: number | null) {
    setProblem(null);
    setPhase("Reading the audio…");
    const [sha256, seconds] = await Promise.all([sha256Hex(blob), knownSeconds ?? durationOf(blob)]);
    if (seconds !== null && seconds > MAX_SECONDS) {
      setPhase(null);
      return setProblem(explain("AUDIO_DURATION_INVALID"));
    }
    setPhase("Uploading…");
    // Clear anything an interrupted earlier attempt left at this path, then store the file.
    await supabase.storage.from("audio").remove([path]);
    const upload = await supabase.storage.from("audio").upload(path, blob, { contentType: mimeOf(format) });
    if (upload.error) {
      setPhase(null);
      return setProblem(explain("STORAGE_UNAVAILABLE"));
    }
    setPhase("Checking…");
    const outcome = await call("register_audio_track", {
      p_consultation_id: consultationId,
      p_speaker: speaker,
      p_format: format,
      p_size_bytes: blob.size,
      p_sha256: sha256,
      p_duration_seconds: seconds === null ? undefined : Math.round(seconds * 100) / 100,
    });
    setPhase(null);
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    discardTake();
    onChanged();
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const format = formatOfFile(file.name);
    if (!format) return setProblem(explain("AUDIO_FORMAT_UNSUPPORTED"));
    if (file.size === 0) return setProblem(explain("AUDIO_FILE_MISSING"));
    if (file.size > MAX_BYTES) return setProblem(explain("AUDIO_TOO_LARGE"));
    void attach(file, format, null);
  }

  async function startRecording() {
    setProblem(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setProblem("The microphone is not available. Allow microphone access in your browser, or attach a file.");
    }
    const chunks: Blob[] = [];
    const started = performance.now();
    // Speech needs little; the free storage plan is small.
    const active = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 });
    active.addEventListener("dataavailable", (event) => chunks.push(event.data));
    active.addEventListener("stop", () => {
      stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      const blob = new Blob(chunks, { type: active.mimeType });
      setTake({
        blob,
        format: formatOfRecording(active.mimeType),
        seconds: (performance.now() - started) / 1000,
        url: URL.createObjectURL(blob),
      });
      setElapsed(null);
      recorder.current = null;
    });
    active.start();
    recorder.current = active;
    setElapsed(0);
  }

  function discardTake() {
    setTake((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function remove() {
    setProblem(null);
    setPhase("Removing…");
    const outcome = await call("remove_audio_track", { p_consultation_id: consultationId, p_speaker: speaker });
    if (outcome.ok) await supabase.storage.from("audio").remove([path]);
    setPhase(null);
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    onChanged();
  }

  const inputId = `${speaker}-file`;
  return (
    <section aria-labelledby={`${speaker}-h`} className={`rounded-xl border border-l-4 bg-card p-5 ${voice.edge}`}>
      <h3 id={`${speaker}-h`} className={`text-lg font-semibold ${voice.ink}`}>{voice.name} audio</h3>

      {track ? (
        <>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Format</dt><dd className="uppercase">{track.format}</dd>
            <dt className="text-muted-foreground">Length</dt>
            <dd>{track.duration_seconds === null ? "Not known yet" : clock(track.duration_seconds)}</dd>
            <dt className="text-muted-foreground">Size</dt><dd>{humanSize(track.size_bytes)}</dd>
            <dt className="text-muted-foreground">SHA-256</dt>
            <dd className="font-mono break-all" title={track.sha256}>{track.sha256.slice(0, 16)}…</dd>
          </dl>
          {track.validation === "invalid" && (
            <p className="mt-3 text-sm font-semibold text-madder">
              Problem: {explain(track.validation_error ?? "AUDIO_CORRUPT")}
            </p>
          )}
          {editable && (
            <Button variant="outline" size="sm" className="mt-4" disabled={phase !== null} onClick={remove}>
              Remove {voice.name.toLowerCase()} audio
            </Button>
          )}
        </>
      ) : !editable ? (
        <p className="mt-3 text-sm text-muted-foreground">{blockedReason ?? "No audio is attached."}</p>
      ) : take ? (
        <div className="mt-3 grid gap-3">
          <p className="text-sm">Recording ready: {clock(take.seconds)}, {humanSize(take.blob.size)}.</p>
          <audio controls src={take.url} className="w-full" aria-label={`Recording for the ${speaker} track`} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={phase !== null} onClick={() => attach(take.blob, take.format, take.seconds)}>
              Attach this recording
            </Button>
            <Button variant="outline" size="sm" disabled={phase !== null} onClick={discardTake}>Discard</Button>
          </div>
        </div>
      ) : elapsed !== null ? (
        <div className="mt-3 grid gap-3">
          <p role="status" className="font-mono">Recording… {clock(elapsed)}</p>
          <Button size="sm" className="justify-self-start" onClick={() => recorder.current?.stop()}>Stop recording</Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={inputId} className="text-sm font-semibold">Attach a file</label>
            <input id={inputId} type="file" accept=".wav,.mp3,.m4a,.mp4,.flac,.ogg,.webm,audio/*"
              disabled={phase !== null}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5"
              onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
          </div>
          <Button variant="outline" size="sm" className="justify-self-start" disabled={phase !== null} onClick={startRecording}>
            Record with the microphone
          </Button>
        </div>
      )}

      {phase && <p role="status" className="mt-3 text-sm text-muted-foreground">{phase}</p>}
      {problem && <p role="alert" className="mt-3 text-sm font-semibold text-madder">Problem: {problem}</p>}
    </section>
  );
}
