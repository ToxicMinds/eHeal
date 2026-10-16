"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { FieldError, Notice } from "@/components/status";
import { call, explain } from "@/lib/api";
import { feeSchema, toCents } from "@/lib/fee";
import { RequireSession } from "@/lib/session";
import { LANGUAGE_LABEL } from "@/lib/status";

const schema = z.object({
  reference: z.string().regex(/^\d{1,8}$/, "Use up to eight digits, for example 0042."),
  scheduled_at: z.string().min(1, "Choose the date and time of the consultation."),
  language: z.enum(["en", "de", "sk", "auto"], "Choose the language of the consultation."),
  consent_recorded: z.boolean(),
  scenario_notes: z.string().max(500, "Keep the notes under 500 characters."),
  fee: feeSchema,
});
type Values = z.infer<typeof schema>;

export default function NewConsultationPage() {
  return <RequireSession>{(user) => <AppShell user={user}><NewConsultation /></AppShell>}</RequireSession>;
}

function NewConsultation() {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reference: "", scheduled_at: "", language: "en", consent_recorded: true, scenario_notes: "", fee: "" },
  });

  useEffect(() => {
    // Now, in the viewer's own time zone, in the form the date-time field expects.
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setValue("scheduled_at", now.toISOString().slice(0, 16));
  }, [setValue]);

  async function create(values: Values) {
    setFailure(null);
    const outcome = await call<{ consultation_id: string }>("create_consultation", {
      p_synthetic_patient_ref: `SYN-${values.reference}`,
      p_scheduled_at: new Date(values.scheduled_at).toISOString(),
      p_language: values.language,
      p_consent_recorded: values.consent_recorded,
      p_scenario_notes: values.scenario_notes,
      p_fee_cents: toCents(values.fee) ?? undefined,
    });
    if (outcome.ok) router.push(`/consultation/?id=${outcome.consultation_id}`);
    else setFailure(explain(outcome.error_category));
  }

  return (
    <>
      <Link href="/consultations/" className="wa-crumb"><ChevronLeft aria-hidden className="wa-icon wa-icon--sm" />Consultations</Link>
      <h1 className="wa-title">New consultation</h1>
      <div className="wa-split">
        <form onSubmit={handleSubmit(create)} noValidate className="wa-panel" aria-label="Consultation details">
          <div className="wa-form">
            <div className="wa-field">
              <label className="wa-label" htmlFor="ref">Patient reference</label>
              <p className="wa-hint" id="ref-hint">Digits only.</p>
              <div className="wa-affixed" style={{ maxWidth: 280 }}>
                <span className="wa-affix" aria-hidden>SYN-</span>
                <input id="ref" className="wa-input" inputMode="numeric" autoComplete="off" spellCheck={false}
                  aria-invalid={Boolean(errors.reference)} aria-describedby="ref-hint ref-error" {...register("reference")} />
              </div>
              <FieldError id="ref-error" message={errors.reference?.message} />
            </div>

            <div className="wa-fields-row">
              <div className="wa-field">
                <label className="wa-label" htmlFor="when">Date and time</label>
                <input id="when" type="datetime-local" className="wa-input" aria-invalid={Boolean(errors.scheduled_at)}
                  aria-describedby="when-error" {...register("scheduled_at")} />
                <FieldError id="when-error" message={errors.scheduled_at?.message} />
              </div>
              <div className="wa-field">
                <label className="wa-label" htmlFor="language">Language spoken</label>
                <div className="wa-select">
                  <select id="language" aria-invalid={Boolean(errors.language)}
                    aria-describedby="language-hint language-error" {...register("language")}>
                    {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
                <FieldError id="language-error" message={errors.language?.message} />
              </div>
            </div>
            <p className="wa-hint" id="language-hint" style={{ marginTop: -12 }}>
              English unless you choose another. The transcript is made in this language; &ldquo;Mixed or unsure&rdquo; lets Watson guess, which is less reliable.
            </p>

            <div className="wa-field">
              <label className="wa-label" htmlFor="fee">Fee</label>
              <p className="wa-hint" id="fee-hint">The patient pays this when they open your link, before the call. Leave it empty for a free consultation.</p>
              <div className="wa-affixed" style={{ maxWidth: 200 }}>
                <span className="wa-affix" aria-hidden>€</span>
                <input id="fee" className="wa-input" inputMode="decimal" autoComplete="off" placeholder="40.00"
                  aria-invalid={Boolean(errors.fee)} aria-describedby="fee-hint fee-error" {...register("fee")} />
              </div>
              <FieldError id="fee-error" message={errors.fee?.message} />
            </div>

            <div className="wa-field">
              <label className="wa-label" htmlFor="notes">Notes</label>
              <p className="wa-hint" id="notes-hint">For example &ldquo;sleep complaint, patient mentions a supplement&rdquo;.</p>
              <textarea id="notes" className="wa-textarea" aria-invalid={Boolean(errors.scenario_notes)}
                aria-describedby="notes-hint notes-error" {...register("scenario_notes")} />
              <FieldError id="notes-error" message={errors.scenario_notes?.message} />
            </div>

            <label className="wa-check">
              <input type="checkbox" {...register("consent_recorded")} />
              <span className="wa-check__text">
                <span className="wa-check__label">Consent to transcription is recorded</span>
                <span className="wa-hint">Without it, no audio can be attached or transcribed. You can record it later.</span>
              </span>
            </label>

            {failure && <Notice tone="failed" title="The consultation was not created">{failure}</Notice>}
            <div className="wa-actions">
              <button type="submit" className="wa-button wa-button--primary" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
                {isSubmitting ? "Creating…" : "Create consultation"}
              </button>
              <Link href="/consultations/" className="wa-button wa-button--secondary">Cancel</Link>
            </div>
          </div>
        </form>
        <aside className="wa-aside" aria-labelledby="next-title">
          <h2 className="wa-heading" id="next-title" style={{ color: "var(--ink)" }}>What happens next</h2>
          <ol>
            <li>Send the patient their link. If you set a fee, they pay it there.</li>
            <li>Start the video call. Both voices are recorded.</li>
            <li>When you end the call, Watson writes the transcript and fills in your form.</li>
            <li>Check each answer against its quote, then approve.</li>
          </ol>
        </aside>
      </div>
    </>
  );
}
