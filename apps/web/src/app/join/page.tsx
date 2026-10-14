"use client";

import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/status";
import { connect, type CallState } from "@/lib/call";

/** Where a patient joins a call from the doctor's link. No account, no sign-in. */
export default function JoinPage() {
  return (
    <>
      <header className="eh-header">
        <div className="eh-header__inner"><span className="eh-wordmark">Watson</span></div>
      </header>
      <main className="eh-page">
        <Suspense fallback={<p className="eh-meta" role="status">Opening the call…</p>}>
          <Join />
        </Suspense>
      </main>
    </>
  );
}

const NOTE: Partial<Record<CallState, string>> = {
  joining: "Opening the call…",
  waiting: "Waiting for your practitioner…",
  connecting: "Connecting…",
  reconnecting: "The connection dropped. Reconnecting…",
};

function Join() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<CallState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const session = useRef<{ leave(): Promise<void> } | null>(null);
  const media = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    media.current?.getTracks().forEach((track) => track.stop());
    void session.current?.leave();
  }, []);

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return <Notice title="This link is not complete">Ask your practitioner to send it again.</Notice>;
  }

  async function join() {
    setProblem(null);
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      return setProblem("Your camera or microphone is not available. Allow them in your browser, then try again.");
    }
    media.current = local;
    if (localVideo.current) localVideo.current.srcObject = local;
    session.current = connect({
      token, role: "patient", local,
      onRemote: (remote) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = remote;
      },
      onState: (next) => {
        setState(next);
        if (next === "ended") media.current?.getTracks().forEach((track) => track.stop());
      },
    });
  }

  async function leave() {
    await session.current?.leave();
    session.current = null;
  }

  function toggle(kind: "audio" | "video") {
    const tracks = kind === "audio" ? media.current?.getAudioTracks() : media.current?.getVideoTracks();
    const off = kind === "audio" ? !muted : !cameraOff;
    tracks?.forEach((track) => (track.enabled = !off));
    if (kind === "audio") setMuted(off);
    else setCameraOff(off);
  }

  const live = state !== null && state !== "ended";
  return (
    <>
      <div className="eh-pagehead__text">
        <h1 className="eh-title">Your consultation</h1>
        <p className="eh-meta">A video call with your practitioner. The conversation is recorded.</p>
      </div>
      <div className="eh-call">
        <div className="eh-screen">
          <video ref={remoteVideo} autoPlay playsInline aria-label="Your practitioner" />
          {state !== "connected" && (
            <div className="eh-screen__note">
              <p className="eh-heading" style={{ color: "inherit" }}>
                {state === null ? "Turn on your camera and microphone to join." :
                  state === "ended" ? "The consultation has ended. You can close this page." : NOTE[state]}
              </p>
            </div>
          )}
          {state === "connected" && <span className="eh-live" role="status">Recorded</span>}
          <div className="eh-screen__self"><video ref={localVideo} autoPlay playsInline muted aria-label="You" /></div>
        </div>
        <div className="eh-call__bar">
          {state === null ? (
            <button type="button" className="eh-button eh-button--primary" onClick={join}>
              <Video aria-hidden className="eh-icon" />Join the call
            </button>
          ) : live ? (
            <>
              <button type="button" className="eh-button eh-button--secondary" aria-pressed={muted} onClick={() => toggle("audio")}>
                {muted ? <MicOff aria-hidden className="eh-icon" /> : <Mic aria-hidden className="eh-icon" />}{muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" className="eh-button eh-button--secondary" aria-pressed={cameraOff} onClick={() => toggle("video")}>
                {cameraOff ? <VideoOff aria-hidden className="eh-icon" /> : <Video aria-hidden className="eh-icon" />}{cameraOff ? "Turn camera on" : "Turn camera off"}
              </button>
              <button type="button" className="eh-button eh-button--danger" onClick={leave}>
                <PhoneOff aria-hidden className="eh-icon" />Leave
              </button>
            </>
          ) : null}
        </div>
        {problem && <Notice tone="failed" title="Could not join">{problem}</Notice>}
      </div>
    </>
  );
}
