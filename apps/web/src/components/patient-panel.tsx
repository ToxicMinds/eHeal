"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { inviteLink } from "@/lib/call";
import type { Tables } from "@/lib/database.types";
import { dateTime } from "@/lib/status";

export const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/** The patient's link, and whether they have paid. */
export function PatientPanel({ consultation }: { consultation: Tables<"consultations"> }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(consultation.invite_token);
  const fee = consultation.fee_cents;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="wa-panel" aria-labelledby="patient-title">
      <div className="wa-panel__head">
        <h2 className="wa-heading" id="patient-title">Patient</h2>
        {fee !== null && (consultation.paid_at ? (
          <span className="wa-chip wa-chip--done"><Check aria-hidden className="wa-icon wa-icon--sm" />
            Paid {euros(consultation.paid_amount_cents ?? fee)} · {dateTime(consultation.paid_at)}</span>
        ) : (
          <span className="wa-chip wa-chip--attention">Not paid yet</span>
        ))}
      </div>
      <div className="wa-field">
        <label className="wa-label" htmlFor="patient-link">Link for the patient</label>
        <div className="wa-invite">
          <input id="patient-link" className="wa-input" readOnly value={link} onFocus={(event) => event.target.select()} />
          <button type="button" className="wa-button wa-button--secondary" onClick={copy}>
            <Copy aria-hidden className="wa-icon" />{copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="wa-hint">
          {fee === null ? "The patient opens the link and waits for you to start the call."
            : `The patient pays ${euros(fee)} when they open the link, then waits for you to start the call.`}
        </p>
      </div>
    </section>
  );
}
