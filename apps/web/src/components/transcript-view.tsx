"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/status";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type Loaded = { transcript: Tables<"transcripts">; segments: Tables<"transcript_segments">[] };

/** 13.4 -> "0:13.4". */
export function stamp(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** The conversation as one column of turns, with the two tracks as rails down its edge. */
export function TranscriptView({ consultationId, language }: { consultationId: string; language: string }) {
  const [loaded, setLoaded] = useState<Loaded | "failed" | null>(null);

  useEffect(() => {
    let current = true;
    supabase.from("transcripts").select("*").eq("consultation_id", consultationId)
      .neq("review_status", "superseded").maybeSingle()
      .then(async ({ data: transcript, error }) => {
        if (error || !transcript) return current && setLoaded("failed");
        const { data: segments, error: failed } = await supabase.from("transcript_segments").select("*")
          .eq("transcript_id", transcript.id).order("position");
        if (current) setLoaded(failed ? "failed" : { transcript, segments });
      });
    return () => {
      current = false;
    };
  }, [consultationId]);

  if (loaded === null) return <p className="wa-meta" role="status">Loading the transcript…</p>;
  if (loaded === "failed") {
    return <Notice tone="failed" title="The transcript could not be loaded">Check your connection and reload the page.</Notice>;
  }

  const { transcript, segments } = loaded;
  const threshold = transcript.low_confidence_threshold;
  const unsure = (segment: Tables<"transcript_segments">) =>
    !segment.possibly_not_speech && segment.confidence !== null && segment.confidence < threshold;
  const toCheck = segments.filter((segment) => unsure(segment) || segment.possibly_not_speech).length;
  const overlaps = segments.filter((segment) => segment.overlap).length;
  const approximate = transcript.ordering === "approximate";

  return (
    <section className="wa-panel wa-transcript" aria-labelledby="transcript-title">
      <div className="wa-panel__head">
        <h2 className="wa-heading" id="transcript-title">Transcript</h2>
        <ul className="wa-facts">
          <li>{segments.length} {segments.length === 1 ? "turn" : "turns"}</li>
          {toCheck > 0 && <li>{toCheck} to check</li>}
          {overlaps > 0 && <li>{overlaps} {overlaps === 1 ? "overlap" : "overlaps"}</li>}
          <li>{language}</li>
        </ul>
      </div>
      {segments.length === 0 ? (
        <Notice title="No speech was found in either track">
          The tracks were transcribed, and the engine heard nothing it could write down.
        </Notice>
      ) : (
        <>
          <ul className="wa-legend">
            <li><span className="wa-swatch wa-swatch--patient" aria-hidden />Patient</li>
            <li><span className="wa-swatch wa-swatch--practitioner" aria-hidden />Practitioner</li>
            <li><span className="wa-tag wa-tag--attention">Unsure</span>Check it against the audio</li>
          </ul>
          {approximate && (
            <Notice title="The order of turns is a best guess">
              The two tracks were not recorded together, so overlaps cannot be shown.
            </Notice>
          )}
          <ol className={approximate ? "wa-turns wa-turns--approximate" : "wa-turns"}>
            {segments.map((segment) => (
              <li key={segment.id} className={[
                "wa-turn", `wa-turn--${segment.speaker}`,
                segment.overlap ? "wa-turn--overlap" : "", segment.possibly_not_speech ? "wa-turn--unsure" : "",
              ].join(" ").trim()}>
                <div className="wa-turn__body">
                  <p className="wa-turn__head">
                    <span className="wa-turn__who">{segment.speaker === "patient" ? "Patient" : "Practitioner"}</span>
                    <span className="wa-turn__time">{stamp(segment.start_seconds)}</span>
                    {segment.overlap && <span className="wa-tag">Overlaps</span>}
                    {segment.possibly_not_speech && <span className="wa-tag wa-tag--attention">May not be speech</span>}
                    {unsure(segment) && <span className="wa-tag wa-tag--attention">Unsure</span>}
                  </p>
                  <p className="wa-turn__text">{segment.machine_text}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
