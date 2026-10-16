import { ArrowRight, Check, CircleAlert, CircleX, Clock, Eye, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { STAGES, summarise, type ConsultationStatus, type Tone } from "@/lib/status";

const CHIP: Record<Tone, { className: string; Icon: typeof Check }> = {
  neutral: { className: "wa-chip", Icon: Clock },
  current: { className: "wa-chip wa-chip--current", Icon: ArrowRight },
  working: { className: "wa-chip wa-chip--current", Icon: LoaderCircle },
  attention: { className: "wa-chip wa-chip--attention", Icon: Eye },
  failed: { className: "wa-chip wa-chip--failed", Icon: CircleX },
  done: { className: "wa-chip wa-chip--done", Icon: Check },
};

/** Where a consultation stands, in words, with an icon so it reads without colour. */
export function StatusChip({ status }: { status: ConsultationStatus }) {
  const { label, tone } = summarise(status);
  const { className, Icon } = CHIP[tone];
  return (
    <span className={className}>
      <Icon aria-hidden className={`wa-icon wa-icon--sm${tone === "working" ? " wa-spin" : ""}`} />
      {label}
    </span>
  );
}

/** Consent, Call, Transcript, Form: four bars with a word under each. */
export function Journey({ status, lines }: { status: ConsultationStatus; lines: readonly string[] }) {
  const { stages } = summarise(status);
  return (
    <ol className="wa-journey" aria-label="Progress">
      {STAGES.map((name, index) => {
        const state = stages[index];
        return (
          <li key={name} className={state === "pending" ? "wa-step" : `wa-step wa-step--${state}`}
            aria-current={state === "current" || state === "attention" ? "step" : undefined}>
            <span className="wa-step__name">
              {state === "done" && <Check aria-hidden className="wa-icon wa-icon--sm" />}
              {state === "failed" && <CircleX aria-hidden className="wa-icon wa-icon--sm" />}
              {name}
            </span>
            <span className="wa-step__state">{lines[index]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A message that changes what the practitioner knows or does. Never used for success. */
export function Notice({ tone = "neutral", title, children, actions }: {
  tone?: "neutral" | "attention" | "failed";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = tone === "failed" ? CircleX : tone === "attention" ? TriangleAlert : Info;
  return (
    <div className={tone === "neutral" ? "wa-notice" : `wa-notice wa-notice--${tone}`} role={tone === "failed" ? "alert" : "status"}>
      <Icon aria-hidden className="wa-icon" />
      <div className="wa-notice__body">
        <p className="wa-notice__title">{title}</p>
        {children && <p className="wa-text">{children}</p>}
        {actions && <div className="wa-notice__actions">{actions}</div>}
      </div>
    </div>
  );
}

/** What is wrong with one field, under it; nothing when the field is fine. */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return <p id={id} className="wa-error"><CircleAlert aria-hidden className="wa-icon" />{message}</p>;
}
