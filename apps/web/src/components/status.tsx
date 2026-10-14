import { ArrowRight, Check, CircleX, Clock, Eye, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { STAGES, summarise, type ConsultationStatus, type Tone } from "@/lib/status";

const CHIP: Record<Tone, { className: string; Icon: typeof Check }> = {
  neutral: { className: "eh-chip", Icon: Clock },
  current: { className: "eh-chip eh-chip--current", Icon: ArrowRight },
  working: { className: "eh-chip eh-chip--current", Icon: LoaderCircle },
  attention: { className: "eh-chip eh-chip--attention", Icon: Eye },
  failed: { className: "eh-chip eh-chip--failed", Icon: CircleX },
  done: { className: "eh-chip eh-chip--done", Icon: Check },
};

/** Where a consultation stands, in words, with an icon so it reads without colour. */
export function StatusChip({ status }: { status: ConsultationStatus }) {
  const { label, tone } = summarise(status);
  const { className, Icon } = CHIP[tone];
  return (
    <span className={className}>
      <Icon aria-hidden className={`eh-icon eh-icon--sm${tone === "working" ? " eh-spin" : ""}`} />
      {label}
    </span>
  );
}

/** Consent, Audio, Transcript, Review: four bars with a word under each. */
export function Journey({ status, lines }: { status: ConsultationStatus; lines: readonly string[] }) {
  const { stages } = summarise(status);
  return (
    <ol className="eh-journey" aria-label="Progress">
      {STAGES.map((name, index) => {
        const state = stages[index];
        return (
          <li key={name} className={state === "pending" ? "eh-step" : `eh-step eh-step--${state}`}
            aria-current={state === "current" || state === "attention" ? "step" : undefined}>
            <span className="eh-step__name">
              {state === "done" && <Check aria-hidden className="eh-icon eh-icon--sm" />}
              {state === "failed" && <CircleX aria-hidden className="eh-icon eh-icon--sm" />}
              {name}
            </span>
            <span className="eh-step__state">{lines[index]}</span>
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
    <div className={tone === "neutral" ? "eh-notice" : `eh-notice eh-notice--${tone}`} role={tone === "failed" ? "alert" : "status"}>
      <Icon aria-hidden className="eh-icon" />
      <div className="eh-notice__body">
        <p className="eh-notice__title">{title}</p>
        {children && <p className="eh-text">{children}</p>}
        {actions && <div className="eh-notice__actions">{actions}</div>}
      </div>
    </div>
  );
}
