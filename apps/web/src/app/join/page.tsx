"use client";

import { Lock, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { euros } from "@/components/patient-panel";
import { Notice } from "@/components/status";
import { connect, type CallState } from "@/lib/call";
import { dateTime } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Details = { scheduled_at: string; fee_cents: number | null; paid: boolean; paid_at: string | null };
const PAYMENT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payment`;

/** Starts a payment (returns Stripe's page) or, with a session, confirms one. */
async function payment(body: { token: string; session_id?: string }): Promise<{ url?: string; paid?: boolean } | null> {
  try {
    const response = await fetch(PAYMENT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Where a patient joins a call from the doctor's link. No account, no sign-in. */
export default function JoinPage() {
  return (
    <>
      <header className="wa-header">
        <div className="wa-header__inner"><span className="wa-wordmark">Watson</span></div>
      </header>
      <main className="wa-page">
        <Suspense fallback={<p className="wa-meta" role="status">Opening the call…</p>}>
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
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const returning = params.get("session_id");
  const cancelled = params.get("cancelled") === "1";
  const [details, setDetails] = useState<Details | "missing" | null>(null);
  const [paying, setPaying] = useState(false);
  const [payProblem, setPayProblem] = useState<string | null>(null);
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

  useEffect(() => {
    if (!/^[0-9a-f]{64}$/.test(token)) return;
    let alive = true;
    const read = async (): Promise<Details | "missing"> => {
      // Back from Stripe: confirm the payment before reading the state.
      if (returning) await payment({ token, session_id: returning });
      const { data } = await supabase.rpc("invite_details", { p_token: token });
      const result = data as ({ ok: boolean } & Details) | null;
      return result?.ok ? result : "missing";
    };
    read().then((result) => alive && setDetails(result));
    return () => {
      alive = false;
    };
  }, [token, returning]);

  if (!/^[0-9a-f]{64}$/.test(token) || details === "missing") {
    return <Notice title="This link is not complete">Ask your practitioner to send it again.</Notice>;
  }
  if (details === null) return <p className="wa-meta" role="status">{returning ? "Checking your payment…" : "Opening your consultation…"}</p>;
  const mustPay = details.fee_cents !== null && !details.paid;

  async function pay() {
    setPaying(true);
    setPayProblem(null);
    const answer = await payment({ token });
    if (answer?.url) return window.location.assign(answer.url);
    setPaying(false);
    setPayProblem("Payment is not available right now. Try again in a moment.");
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
      <div className="wa-pagehead__text">
        <h1 className="wa-title">Your consultation</h1>
        <p className="wa-meta">{dateTime(details.scheduled_at)} · a video call with your practitioner. The conversation is recorded.</p>
      </div>
      {mustPay ? (
        <>
          {cancelled && <Notice title="The payment was not completed">Nothing was charged. You can try again.</Notice>}
          {returning && <Notice tone="attention" title="Your payment is not confirmed yet">If you paid, reload this page in a moment.</Notice>}
          <div className="wa-fee">
            <p className="wa-meta" style={{ margin: 0 }}>Consultation fee</p>
            <p className="wa-fee__amount">{euros(details.fee_cents ?? 0)}</p>
          </div>
          <div className="wa-actions">
            <button type="button" className="wa-button wa-button--primary" disabled={paying} aria-busy={paying || undefined} onClick={pay}>
              <Lock aria-hidden className="wa-icon" />{paying ? "Opening Stripe…" : `Pay ${euros(details.fee_cents ?? 0)}`}
            </button>
          </div>
          <p className="wa-hint">You pay on Stripe&apos;s secure page and come straight back here. Watson never sees your card.</p>
          {payProblem && <Notice tone="failed" title="Could not start the payment">{payProblem}</Notice>}
        </>
      ) : (<>
      {details.paid && state === null && (
        <Notice title="Paid. Thank you.">
          {euros(details.fee_cents ?? 0)}{details.paid_at ? ` on ${dateTime(details.paid_at)}` : ""}. Stripe emails you a receipt.
        </Notice>
      )}
      <div className="wa-call">
        <div className="wa-screen">
          <video ref={remoteVideo} autoPlay playsInline aria-label="Your practitioner" />
          {state !== "connected" && (
            <div className="wa-screen__note">
              <p className="wa-heading" style={{ color: "inherit" }}>
                {state === null ? "Turn on your camera and microphone to join." :
                  state === "ended" ? "The consultation has ended. You can close this page." : NOTE[state]}
              </p>
            </div>
          )}
          {state === "connected" && <span className="wa-live" role="status">Recorded</span>}
          <div className="wa-screen__self"><video ref={localVideo} autoPlay playsInline muted aria-label="You" /></div>
        </div>
        <div className="wa-call__bar">
          {state === null ? (
            <button type="button" className="wa-button wa-button--primary" onClick={join}>
              <Video aria-hidden className="wa-icon" />Join the call
            </button>
          ) : live ? (
            <>
              <button type="button" className="wa-button wa-button--secondary" aria-pressed={muted} onClick={() => toggle("audio")}>
                {muted ? <MicOff aria-hidden className="wa-icon" /> : <Mic aria-hidden className="wa-icon" />}{muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" className="wa-button wa-button--secondary" aria-pressed={cameraOff} onClick={() => toggle("video")}>
                {cameraOff ? <VideoOff aria-hidden className="wa-icon" /> : <Video aria-hidden className="wa-icon" />}{cameraOff ? "Turn camera on" : "Turn camera off"}
              </button>
              <button type="button" className="wa-button wa-button--danger" onClick={leave}>
                <PhoneOff aria-hidden className="wa-icon" />Leave
              </button>
            </>
          ) : null}
        </div>
        {problem && <Notice tone="failed" title="Could not join">{problem}</Notice>}
      </div>
      </>)}
    </>
  );
}
