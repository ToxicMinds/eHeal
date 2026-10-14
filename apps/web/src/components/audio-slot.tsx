"use client";

import { Mic, Pause, Play, Square, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { call, explain } from "@/lib/api";
import { clock, formatOfFile, formatOfRecording, humanSize, MAX_BYTES, type AudioFormat } from "@/lib/audio";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { attachAudio, type Speaker } from "@/lib/tracks";

type Take = { blob: Blob; format: AudioFormat; seconds: number; url: string };
const NAME: Record<Speaker, string> = { practitioner: "Practitioner", patient: "Patient" };
const HHMM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** One speaker's audio: drop or choose a file, or record one; check it, replace it or remove it. */
export function AudioSlot({ speaker, track, consultationId, userId, editable, onChanged }: {
  speaker: Speaker;
  track: Tables<"audio_tracks"> | undefined;
  consultationId: string;
  userId: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const name = NAME[speaker];
  const path = `${userId}/${consultationId}/${speaker}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [recording, setRecording] = useState<{ seconds: number; levels: number[] } | null>(null);
  const [over, setOver] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function attach(blob: Blob, format: AudioFormat, knownSeconds: number | null) {
    setProblem(null);
    const failure = await attachAudio({
      consultationId, userId, speaker, blob, format, seconds: knownSeconds, onStep: setBusy,
    });
    setBusy(null);
    if (failure) return setProblem(failure);
    discardTake();
    onChanged();
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const format = formatOfFile(file.name);
    if (!format) return setProblem(explain("AUDIO_FORMAT_UNSUPPORTED"));
    if (file.size === 0) return setProblem(explain("AUDIO_FILE_MISSING"));
    if (file.size > MAX_BYTES) return setProblem(`This file is ${humanSize(file.size)}. ${explain("AUDIO_TOO_LARGE")}`);
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
    // A level meter, so the practitioner can see the microphone hears them.
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const meter = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const peak = samples.reduce((loudest, sample) => Math.max(loudest, Math.abs(sample - 128)), 0);
      setRecording((current) => current && {
        seconds: (performance.now() - started) / 1000,
        levels: [...current.levels.slice(-6), Math.min(1, 0.15 + peak / 48)],
      });
    }, 150);
    active.addEventListener("dataavailable", (event) => chunks.push(event.data));
    active.addEventListener("stop", () => {
      clearInterval(meter);
      void context.close();
      stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      const blob = new Blob(chunks, { type: active.mimeType });
      setTake({
        blob,
        format: formatOfRecording(active.mimeType),
        seconds: (performance.now() - started) / 1000,
        url: URL.createObjectURL(blob),
      });
      setRecording(null);
      recorder.current = null;
    });
    active.start();
    recorder.current = active;
    setRecording({ seconds: 0, levels: [] });
  }

  function discardTake() {
    setTake((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function remove() {
    setProblem(null);
    setBusy("Removing…");
    const outcome = await call("remove_audio_track", { p_consultation_id: consultationId, p_speaker: speaker });
    if (outcome.ok) await supabase.storage.from("audio").remove([path]);
    setBusy(null);
    if (!outcome.ok) return setProblem(explain(outcome.error_category));
    onChanged();
  }

  return (
    <section className={speaker === "patient" ? "wa-slot wa-slot--patient" : "wa-slot"} aria-label={`${name} track`}>
      <div className="wa-slot__head">
        <h3 className="wa-slot__voice">{name}</h3>
        <span className="wa-hint">
          {recording ? "Recording" : track ? `Attached ${HHMM.format(new Date(track.created_at))}` : "Not attached"}
        </span>
      </div>

      {track ? (
        <>
          <Player path={path} speaker={name} seconds={track.duration_seconds} />
          <ul className="wa-facts"><li>{track.format.toUpperCase()}</li><li>{humanSize(track.size_bytes)}</li></ul>
          <details className="wa-details">
            <summary>Details</summary>
            <p className="wa-hint wa-mono" style={{ overflowWrap: "anywhere" }}>SHA-256 {track.sha256}</p>
          </details>
          {track.validation === "invalid" && (
            <p className="wa-error" role="alert">{explain(track.validation_error ?? "AUDIO_CORRUPT")}</p>
          )}
          {editable && (
            <div className="wa-actions">
              <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy !== null}
                aria-label={`Replace ${name.toLowerCase()} audio`} onClick={remove}>Replace</button>
              <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy !== null}
                aria-label={`Remove ${name.toLowerCase()} audio`} onClick={remove}>Remove</button>
            </div>
          )}
        </>
      ) : !editable ? (
        <p className="wa-hint">No audio attached.</p>
      ) : recording ? (
        <div className="wa-rec">
          <span className="wa-rec__dot" aria-hidden />
          <span className="wa-rec__time" role="timer">{clock(recording.seconds)}</span>
          <span className="wa-level" aria-hidden>
            {recording.levels.map((level, index) => <span key={index} style={{ height: `${level * 100}%` }} />)}
          </span>
          <button type="button" className="wa-button wa-button--secondary wa-button--small" onClick={() => recorder.current?.stop()}>
            <Square aria-hidden className="wa-icon wa-icon--sm" fill="currentColor" />Stop
          </button>
        </div>
      ) : take ? (
        <>
          <p className="wa-hint">Recording ready: {clock(take.seconds)}, {humanSize(take.blob.size)}.</p>
          <audio controls src={take.url} style={{ width: "100%" }} aria-label={`Recording for the ${name.toLowerCase()} track`} />
          <div className="wa-actions">
            <button type="button" className="wa-button wa-button--primary wa-button--small" disabled={busy !== null}
              onClick={() => attach(take.blob, take.format, take.seconds)}>Attach this recording</button>
            <button type="button" className="wa-button wa-button--quiet wa-button--small" disabled={busy !== null}
              onClick={discardTake}>Discard</button>
          </div>
        </>
      ) : (
        <div className="wa-drop" data-over={over}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); chooseFile(event.dataTransfer.files[0]); }}>
          <Upload aria-hidden className="wa-icon" />
          <span className="wa-drop__lead">{speaker === "patient" ? "Drop the patient's audio here" : "Drop your audio here"}</span>
          <span className="wa-hint">wav, mp3, m4a, flac, ogg or webm, up to 50 MB and 2 hours</span>
          <div className="wa-drop__actions">
            <button type="button" className="wa-button wa-button--secondary wa-button--small" disabled={busy !== null}
              onClick={() => fileInput.current?.click()}>Choose file</button>
            <button type="button" className="wa-button wa-button--secondary wa-button--small" disabled={busy !== null}
              onClick={startRecording}><Mic aria-hidden className="wa-icon wa-icon--sm" />Record with microphone</button>
          </div>
          <input ref={fileInput} type="file" hidden aria-label={`${name} audio file`}
            accept=".wav,.mp3,.m4a,.mp4,.flac,.ogg,.webm,audio/*"
            onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
      )}

      {busy && <p className="wa-hint" role="status">{busy}</p>}
      {problem && <p className="wa-error" role="alert">{problem}</p>}
    </section>
  );
}

/** Plays a stored track, so the practitioner can check it is the right file. */
function Player({ path, speaker, seconds }: { path: string; speaker: string; seconds: number | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(seconds);

  useEffect(() => () => audio.current?.pause(), []);

  async function toggle() {
    if (!audio.current) {
      // A short-lived link, made only when the practitioner asks to listen.
      const { data } = await supabase.storage.from("audio").createSignedUrl(path, 600);
      if (!data) return;
      const element = new Audio(data.signedUrl);
      element.addEventListener("timeupdate", () => setAt(element.currentTime));
      element.addEventListener("loadedmetadata", () => Number.isFinite(element.duration) && setLength(element.duration));
      element.addEventListener("ended", () => setPlaying(false));
      audio.current = element;
    }
    if (audio.current.paused) {
      await audio.current.play();
      setPlaying(true);
    } else {
      audio.current.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="wa-player">
      <button type="button" className="wa-play" aria-label={`${playing ? "Pause" : "Play"} ${speaker.toLowerCase()} track`} onClick={toggle}>
        {playing ? <Pause aria-hidden className="wa-icon" fill="currentColor" /> : <Play aria-hidden className="wa-icon" fill="currentColor" />}
      </button>
      <div className="wa-scrub" role="presentation">
        <div className="wa-scrub__fill" style={{ width: length ? `${Math.min(100, (at / length) * 100)}%` : "0%" }} />
      </div>
      <span className="wa-player__time">{clock(at)} / {length === null ? "–" : clock(length)}</span>
    </div>
  );
}
