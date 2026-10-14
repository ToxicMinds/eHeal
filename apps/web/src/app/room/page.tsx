"use client";

import { ChevronLeft, Copy, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/status";
import { call as rpc, explain } from "@/lib/api";
import { clock } from "@/lib/audio";
import { connect, inviteLink, newInviteToken, recordCall, type CallState, type Recording } from "@/lib/call";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { attachAudio } from "@/lib/tracks";

type Loaded = { consultation: Tables<"consultations">; tracks: number };
const CAN_CALL = ["consent_pending", "ready_for_audio"];

export default function RoomPage() {
  return (
    <RequireSession>
      {(user) => (
        <AppShell user={user}>
          <Suspense fallback={<p className="eh-meta" role="status">Loading the call…</p>}>
            <Room userId={user.id} />
          </Suspense>
        </AppShell>
      )}
    </RequireSession>
  );
}

const NOTE: Partial<Record<CallState, [string, string]>> = {
  joining: ["Opening the call…", ""],
  waiting: ["Waiting for the patient", "Send them the link above. Recording starts when they join."],
  connecting: ["Connecting…", ""],
  reconnecting: ["The connection dropped. Reconnecting…", "Recording continues."],
};

function Room({ userId }: { userId: string }) {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "missing" | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<Recording | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const session = useRef<{ leave(): Promise<void> } | null>(null);
  const recorder = useRef<ReturnType<typeof recordCall> | null>(null);
  const media = useRef<MediaStream | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([
      supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
      supabase.from("audio_tracks").select("id", { count: "exact", head: true }).eq("consultation_id", id),
    ]).then(([consultation, tracks]) => {
      if (current) setLoaded(consultation.data ? { consultation: consultation.data, tracks: tracks.count ?? 0 } : "missing");
    });
    return () => {
      current = false;
    };
  }, [id]);

  const live = state !== null && state !== "ended";
  useEffect(() => {
    if (!live) return;
    const tick = setInterval(() => setElapsed(recorder.current?.seconds ?? 0), 1000);
    // Leaving the page mid-call would lose the recording.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(tick);
      window.removeEventListener("beforeunload", warn);
    };
  }, [live]);
  useEffect(() => () => {
    media.current?.getTracks().forEach((track) => track.stop());
    void session.current?.leave();
  }, []);

  const back = (
    <Link href={`/consultation/?id=${id}`} className="eh-crumb"><ChevronLeft aria-hidden className="eh-icon eh-icon--sm" />Consultation</Link>
  );
  if (loaded === null) return <p className="eh-meta" role="status">Loading the call…</p>;
  if (loaded === "missing") return <>{back}<p className="eh-text">This consultation does not exist, or it is not yours.</p></>;
  const { consultation } = loaded;
  if (!state && !step && (loaded.tracks > 0 || !CAN_CALL.includes(consultation.status))) {
    return (
      <>{back}
        <h1 className="eh-title">{consultation.synthetic_patient_ref}</h1>
        <Notice title="This consultation already has audio">A call can be recorded only before any audio is attached.</Notice>
      </>
    );
  }

  async function start() {
    setProblem(null);
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      return setProblem("The camera or microphone is not available. Allow them in your browser, then try again.");
    }
    if (consultation.status === "consent_pending") {
      // Test mode records every call; consent is recorded as the call starts (decision 0005).
      const outcome = await rpc("record_consent", { p_consultation_id: id });
      if (!outcome.ok) return setProblem(explain(outcome.error_category));
    }
    media.current = local;
    if (localVideo.current) localVideo.current.srcObject = local;
    const saved = sessionStorage.getItem(`call-${id}`);
    const invite = saved ?? newInviteToken();
    sessionStorage.setItem(`call-${id}`, invite);
    setToken(invite);
    const recording = recordCall(local);
    recorder.current = recording;
    session.current = connect({
      token: invite, role: "doctor", local,
      onRemote: (remote) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = remote;
        recording.addPatient(remote);
      },
      onState: (next) => {
        setState(next);
        if (next === "connected") {
          recording.start();
          setRecording(true);
        }
      },
    });
  }

  async function save(recording: Recording) {
    setProblem(null);
    for (const speaker of ["practitioner", "patient"] as const) {
      const failure = await attachAudio({
        consultationId: id, userId, speaker, blob: recording[speaker], format: recording.format,
        seconds: recording.seconds, onStep: setStep,
      });
      if (failure) {
        setStep(null);
        setUnsaved(recording);
        return setProblem(failure);
      }
    }
    setStep("Starting transcription…");
    await rpc("declare_recorded_together", { p_consultation_id: id, p_recorded_together: true });
    await rpc("start_transcription", { p_consultation_id: id });
    sessionStorage.removeItem(`call-${id}`);
    router.push(`/consultation/?id=${id}`);
  }

  async function end() {
    setStep("Ending the call…");
    await session.current?.leave();
    session.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    const recording = await recorder.current?.stop();
    if (recording) return save(recording);
    sessionStorage.removeItem(`call-${id}`);
    router.push(`/consultation/?id=${id}`);
  }

  function toggle(kind: "audio" | "video") {
    const tracks = kind === "audio" ? media.current?.getAudioTracks() : media.current?.getVideoTracks();
    const off = kind === "audio" ? !muted : !cameraOff;
    tracks?.forEach((track) => (track.enabled = !off));
    if (kind === "audio") setMuted(off);
    else setCameraOff(off);
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const note = state === null ? ["Start the call, then send the patient the link.", ""] : NOTE[state];
  const link = token ? inviteLink(token) : null;
  return (
    <>
      {back}
      <div className="eh-pagehead">
        <div className="eh-pagehead__text">
          <h1 className="eh-title">{consultation.synthetic_patient_ref}</h1>
          <p className="eh-meta">Video call. Both voices are recorded and transcribed when you end the call.</p>
        </div>
      </div>
      <div className="eh-call">
        {link && live && (
          <div className="eh-field">
            <label className="eh-label" htmlFor="invite">Send this link to the patient</label>
            <div className="eh-invite">
              <input id="invite" className="eh-input" readOnly value={link} onFocus={(event) => event.target.select()} />
              <button type="button" className="eh-button eh-button--secondary" onClick={() => copy(link)}>
                <Copy aria-hidden className="eh-icon" />{copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
        <div className="eh-screen">
          <video ref={remoteVideo} autoPlay playsInline aria-label="The patient" />
          {state !== "connected" && note && (
            <div className="eh-screen__note">
              <p className="eh-heading" style={{ color: "inherit" }}>{note[0]}</p>
              {note[1] && <p className="eh-text">{note[1]}</p>}
            </div>
          )}
          {recording && live && <span className="eh-live" role="status">Recording {clock(elapsed)}</span>}
          <div className="eh-screen__self"><video ref={localVideo} autoPlay playsInline muted aria-label="You" /></div>
        </div>
        <div className="eh-call__bar">
          {state === null && !step ? (
            <button type="button" className="eh-button eh-button--primary" onClick={start}>
              <Video aria-hidden className="eh-icon" />Start video call
            </button>
          ) : live && !step ? (
            <>
              <button type="button" className="eh-button eh-button--secondary" aria-pressed={muted} onClick={() => toggle("audio")}>
                {muted ? <MicOff aria-hidden className="eh-icon" /> : <Mic aria-hidden className="eh-icon" />}{muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" className="eh-button eh-button--secondary" aria-pressed={cameraOff} onClick={() => toggle("video")}>
                {cameraOff ? <VideoOff aria-hidden className="eh-icon" /> : <Video aria-hidden className="eh-icon" />}{cameraOff ? "Turn camera on" : "Turn camera off"}
              </button>
              <button type="button" className="eh-button eh-button--danger" onClick={end}>
                <PhoneOff aria-hidden className="eh-icon" />End call
              </button>
            </>
          ) : null}
        </div>
        {step && <p className="eh-meta" role="status" style={{ textAlign: "center" }}>{step}</p>}
        {problem && (
          <Notice tone="failed" title="That did not work" actions={unsaved && (
            <button type="button" className="eh-button eh-button--primary" onClick={() => save(unsaved)}>Try saving again</button>
          )}>
            {problem}
          </Notice>
        )}
      </div>
    </>
  );
}
