import type { Database } from "./database.types";

export type ConsultationStatus = Database["public"]["Enums"]["consultation_status"];
export type ConsultationLanguage = Database["public"]["Enums"]["consultation_language"];

/** The four things that must happen to a consultation in phase 1, in order. */
export const STAGES = ["Consent", "Audio", "Transcript", "Review"] as const;
export type StageState = "done" | "current" | "attention" | "failed" | "pending";
type Stages = readonly [StageState, StageState, StageState, StageState];

/** How a status chip looks: see the StatusChip component of the design system. */
export type Tone = "neutral" | "current" | "working" | "attention" | "failed" | "done";

/** Who has to act next: the groups of the consultation list. */
export const GROUPS = ["Needs you", "Transcribing", "Done"] as const;
export type Group = (typeof GROUPS)[number];

type Summary = { label: string; tone: Tone; group: Group; stages: Stages };
const ALL_DONE: Stages = ["done", "done", "done", "done"];
const LATER = (label: string, tone: Tone = "done"): Summary => ({ label, tone, group: "Done", stages: ALL_DONE });

const SUMMARY: Record<ConsultationStatus, Summary> = {
  consent_pending: { label: "Waiting for consent", tone: "neutral", group: "Needs you", stages: ["current", "pending", "pending", "pending"] },
  ready_for_audio: { label: "Waiting for audio", tone: "current", group: "Needs you", stages: ["done", "current", "pending", "pending"] },
  audio_imported: { label: "Ready to transcribe", tone: "current", group: "Needs you", stages: ["done", "done", "current", "pending"] },
  transcription_processing: { label: "Transcribing", tone: "working", group: "Transcribing", stages: ["done", "done", "current", "pending"] },
  transcription_failed: { label: "Transcription failed", tone: "failed", group: "Needs you", stages: ["done", "done", "failed", "pending"] },
  transcript_ready: { label: "Transcript ready to review", tone: "attention", group: "Needs you", stages: ["done", "done", "done", "attention"] },
  transcript_under_review: { label: "Review in progress", tone: "attention", group: "Needs you", stages: ["done", "done", "done", "attention"] },
  transcript_reviewed: LATER("Transcript reviewed"),
  extraction_processing: LATER("Drafting", "working"),
  extraction_failed: LATER("Drafting failed", "failed"),
  draft_ready: LATER("Draft ready", "attention"),
  under_review: LATER("Draft under review", "attention"),
  approved: LATER("Approved"),
  corrected: LATER("Corrected"),
  consent_withdrawn: { label: "Consent withdrawn", tone: "failed", group: "Done", stages: ["failed", "pending", "pending", "pending"] },
  archived: LATER("Archived"),
};

export function summarise(status: ConsultationStatus): Summary {
  return SUMMARY[status];
}

export const LANGUAGE_LABEL: Record<ConsultationLanguage, string> = {
  en: "English",
  de: "German",
  sk: "Slovak",
  auto: "Mixed or unsure",
};

// European order and a 24-hour clock, in the viewer's own time zone (design system README).
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "Tue 13 Oct 2026, 09:30". */
export const dateTime = (iso: string) => DATE_TIME.format(new Date(iso)).replace(/^(\w+),/, "$1");
/** "13 Oct". */
export const dayMonth = (iso: string) => DAY_MONTH.format(new Date(iso));
