import type { Database } from "./database.types";

export type ConsultationStatus = Database["public"]["Enums"]["consultation_status"];
export type ConsultationLanguage = Database["public"]["Enums"]["consultation_language"];

/** The four things that must happen to a consultation in phase 1, in order. */
export const STAGES = ["Consent", "Audio", "Transcript", "Review"] as const;
export type StageState = "done" | "current" | "failed" | "pending";
type Stages = readonly [StageState, StageState, StageState, StageState];

const ALL_DONE: Stages = ["done", "done", "done", "done"];

const SUMMARY: Record<ConsultationStatus, { label: string; stages: Stages }> = {
  consent_pending: { label: "Waiting for consent", stages: ["current", "pending", "pending", "pending"] },
  ready_for_audio: { label: "Waiting for audio", stages: ["done", "current", "pending", "pending"] },
  audio_imported: { label: "Ready to transcribe", stages: ["done", "done", "current", "pending"] },
  transcription_processing: { label: "Transcribing", stages: ["done", "done", "current", "pending"] },
  transcription_failed: { label: "Transcription failed", stages: ["done", "done", "failed", "pending"] },
  transcript_ready: { label: "Transcript ready to review", stages: ["done", "done", "done", "current"] },
  transcript_under_review: { label: "Review in progress", stages: ["done", "done", "done", "current"] },
  transcript_reviewed: { label: "Transcript reviewed", stages: ALL_DONE },
  extraction_processing: { label: "Drafting", stages: ALL_DONE },
  extraction_failed: { label: "Drafting failed", stages: ALL_DONE },
  draft_ready: { label: "Draft ready", stages: ALL_DONE },
  under_review: { label: "Draft under review", stages: ALL_DONE },
  approved: { label: "Approved", stages: ALL_DONE },
  corrected: { label: "Corrected", stages: ALL_DONE },
  consent_withdrawn: { label: "Consent withdrawn", stages: ["failed", "pending", "pending", "pending"] },
  archived: { label: "Archived", stages: ALL_DONE },
};

export function summarise(status: ConsultationStatus) {
  return SUMMARY[status];
}

export const LANGUAGE_LABEL: Record<ConsultationLanguage, string> = {
  en: "English",
  de: "German",
  sk: "Slovak",
  auto: "Mixed or unsure",
};
