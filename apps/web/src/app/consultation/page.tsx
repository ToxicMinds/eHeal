"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusRail } from "@/components/status-rail";
import { TrackCard } from "@/components/track-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { call, explain } from "@/lib/api";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { LANGUAGE_LABEL } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Loaded = { consultation: Tables<"consultations">; tracks: Tables<"audio_tracks">[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
const AUDIO_CAN_CHANGE = ["ready_for_audio", "audio_imported", "transcription_failed"];

export default function ConsultationPage() {
  return (
    <RequireSession>
      {(user) => (
        <AppShell user={user}>
          <Suspense fallback={<p role="status" className="text-muted-foreground">Loading the consultation…</p>}>
            <Consultation userId={user.id} />
          </Suspense>
        </AppShell>
      )}
    </RequireSession>
  );
}

function Consultation({ userId }: { userId: string }) {
  const id = useSearchParams().get("id") ?? "";
  const [loaded, setLoaded] = useState<Loaded | "missing" | "failed" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async (): Promise<Loaded | "missing" | "failed"> => {
    const [consultation, tracks] = await Promise.all([
      supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
      supabase.from("audio_tracks").select("*").eq("consultation_id", id),
    ]);
    if (consultation.error || tracks.error) return "failed";
    return consultation.data ? { consultation: consultation.data, tracks: tracks.data } : "missing";
  }, [id]);
  const load = useCallback(() => fetchAll().then(setLoaded), [fetchAll]);

  useEffect(() => {
    if (!UUID.test(id)) return;
    let current = true;
    fetchAll().then((result) => {
      if (current) setLoaded(result);
    });
    return () => {
      current = false;
    };
  }, [id, fetchAll]);

  const back = (
    <p className="text-sm">
      <Link href="/consultations/" className="underline underline-offset-4">Consultations</Link>
    </p>
  );

  if (!UUID.test(id) || loaded === "missing") {
    return <>{back}<p className="mt-4">This consultation does not exist, or it is not yours.</p></>;
  }
  if (loaded === "failed") {
    return (
      <>{back}
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>Problem: the consultation could not be loaded. Check your connection and reload the page.</AlertDescription>
        </Alert>
      </>
    );
  }
  if (loaded === null) {
    return <p role="status" className="text-muted-foreground">Loading the consultation…</p>;
  }

  const { consultation, tracks } = loaded;
  const hasConsent = consultation.consent_recorded_at !== null;
  const editable = hasConsent && AUDIO_CAN_CHANGE.includes(consultation.status);
  const blockedReason = hasConsent ? null : "Record consent first.";

  async function declareRecordedTogether(recordedTogether: boolean) {
    setBusy(true);
    setProblem(null);
    const outcome = await call("declare_recorded_together", {
      p_consultation_id: consultation.id,
      p_recorded_together: recordedTogether,
    });
    setBusy(false);
    if (!outcome.ok) setProblem(explain(outcome.error_category));
    await load();
  }

  async function recordConsent() {
    setBusy(true);
    setProblem(null);
    const outcome = await call("record_consent", { p_consultation_id: consultation.id });
    setBusy(false);
    if (!outcome.ok) setProblem(explain(outcome.error_category));
    await load();
  }

  return (
    <>
      {back}
      <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight">
        <span className="font-mono text-3xl">{consultation.synthetic_patient_ref}</span>
      </h1>
      <p className="mt-2 text-muted-foreground">
        {WHEN.format(new Date(consultation.scheduled_at))} · {LANGUAGE_LABEL[consultation.language]}
      </p>
      <div className="mt-3"><StatusRail status={consultation.status} /></div>
      {consultation.scenario_notes && (
        <p className="mt-4 max-w-2xl"><span className="font-semibold">Invented scenario:</span> {consultation.scenario_notes}</p>
      )}
      {problem && (
        <Alert variant="destructive" className="mt-4"><AlertDescription>Problem: {problem}</AlertDescription></Alert>
      )}

      <section aria-labelledby="consent-h" className="mt-8">
        <h2 id="consent-h" className="text-2xl font-semibold">Consent</h2>
        {hasConsent ? (
          <p className="mt-2">
            Consent to transcription was recorded on {WHEN.format(new Date(consultation.consent_recorded_at!))}.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-2xl">
              No audio can be attached or transcribed until consent to transcription is recorded for
              this invented consultation.
            </p>
            <Button className="mt-3" disabled={busy} onClick={recordConsent}>Record consent</Button>
          </>
        )}
      </section>

      <section aria-labelledby="audio-h" className="mt-8">
        <h2 id="audio-h" className="text-2xl font-semibold">Audio</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          One track for each speaker. Supported formats: wav, mp3, m4a, mp4, flac, ogg, webm. Up to 50 MB
          and two hours per track; use a compressed format for long recordings.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["practitioner", "patient"] as const).map((speaker) => (
            <TrackCard key={speaker} speaker={speaker}
              track={tracks.find((track) => track.speaker === speaker)}
              consultationId={consultation.id} userId={userId}
              editable={editable} blockedReason={blockedReason} onChanged={load} />
          ))}
        </div>
        <label className="mt-4 flex max-w-2xl items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-practitioner"
            checked={consultation.recorded_together} disabled={!editable || busy}
            onChange={(event) => declareRecordedTogether(event.target.checked)} />
          <span>
            <span className="font-semibold">Both tracks were recorded together and start at the same moment</span>
            <span className="block text-sm text-muted-foreground">
              Leave this off if you are not sure. The transcript then shows the order of turns as a
              best guess and says so.
            </span>
          </span>
        </label>
      </section>
    </>
  );
}
