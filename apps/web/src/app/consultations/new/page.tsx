"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/status";
import { call, explain } from "@/lib/api";
import { RequireSession } from "@/lib/session";
import { LANGUAGE_LABEL } from "@/lib/status";

const schema = z.object({
  reference: z.string().regex(/^\d{1,8}$/, "Use up to eight digits, for example 0042."),
  scheduled_at: z.string().min(1, "Choose the date and time of the consultation."),
  language: z.enum(["en", "de", "sk", "auto"], "Choose the language of the consultation."),
  consent_recorded: z.boolean(),
  scenario_notes: z.string().max(500, "Keep the notes under 500 characters."),
});
type Values = z.infer<typeof schema>;

export default function NewConsultationPage() {
  return <RequireSession>{(user) => <AppShell user={user}><NewConsultation /></AppShell>}</RequireSession>;
}

function Problem({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="eh-error"><CircleAlert aria-hidden className="eh-icon" />{message}</p>;
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
    defaultValues: { reference: "", scheduled_at: "", consent_recorded: true, scenario_notes: "" },
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
    });
    if (outcome.ok) router.push(`/consultation/?id=${outcome.consultation_id}`);
    else setFailure(explain(outcome.error_category));
  }

  return (
    <>
      <Link href="/consultations/" className="eh-crumb"><ChevronLeft aria-hidden className="eh-icon eh-icon--sm" />Consultations</Link>
      <h1 className="eh-title">New consultation</h1>
      <div className="eh-split">
        <form onSubmit={handleSubmit(create)} noValidate className="eh-panel" aria-label="Consultation details">
          <div className="eh-form">
            <div className="eh-field">
              <label className="eh-label" htmlFor="ref">Patient reference</label>
              <p className="eh-hint" id="ref-hint">Digits only.</p>
              <div className="eh-affixed" style={{ maxWidth: 280 }}>
                <span className="eh-affix" aria-hidden>SYN-</span>
                <input id="ref" className="eh-input" inputMode="numeric" autoComplete="off" spellCheck={false}
                  aria-invalid={Boolean(errors.reference)} aria-describedby="ref-hint ref-error" {...register("reference")} />
              </div>
              <Problem id="ref-error" message={errors.reference?.message} />
            </div>

            <div className="eh-fields-row">
              <div className="eh-field">
                <label className="eh-label" htmlFor="when">Date and time</label>
                <input id="when" type="datetime-local" className="eh-input" aria-invalid={Boolean(errors.scheduled_at)}
                  aria-describedby="when-error" {...register("scheduled_at")} />
                <Problem id="when-error" message={errors.scheduled_at?.message} />
              </div>
              <div className="eh-field">
                <label className="eh-label" htmlFor="language">Language spoken</label>
                <div className="eh-select">
                  <select id="language" defaultValue="" aria-invalid={Boolean(errors.language)}
                    aria-describedby="language-hint language-error" {...register("language")}>
                    <option value="" disabled>Choose…</option>
                    {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
                <Problem id="language-error" message={errors.language?.message} />
              </div>
            </div>
            <p className="eh-hint" id="language-hint" style={{ marginTop: -12 }}>
              The transcript is made in this language. &ldquo;Mixed or unsure&rdquo; lets the engine guess, which is less reliable.
            </p>

            <div className="eh-field">
              <label className="eh-label" htmlFor="notes">Notes</label>
              <p className="eh-hint" id="notes-hint">For example &ldquo;sleep complaint, patient mentions a supplement&rdquo;.</p>
              <textarea id="notes" className="eh-textarea" aria-invalid={Boolean(errors.scenario_notes)}
                aria-describedby="notes-hint notes-error" {...register("scenario_notes")} />
              <Problem id="notes-error" message={errors.scenario_notes?.message} />
            </div>

            <label className="eh-check">
              <input type="checkbox" {...register("consent_recorded")} />
              <span className="eh-check__text">
                <span className="eh-check__label">Consent to transcription is recorded</span>
                <span className="eh-hint">Without it, no audio can be attached or transcribed. You can record it later.</span>
              </span>
            </label>

            {failure && <Notice tone="failed" title="The consultation was not created">{failure}</Notice>}
            <div className="eh-actions">
              <button type="submit" className="eh-button eh-button--primary" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
                {isSubmitting ? "Creating…" : "Create consultation"}
              </button>
              <Link href="/consultations/" className="eh-button eh-button--secondary">Cancel</Link>
            </div>
          </div>
        </form>
        <aside className="eh-aside" aria-labelledby="next-title">
          <h2 className="eh-heading" id="next-title" style={{ color: "var(--ink)" }}>What happens next</h2>
          <ol>
            <li>Attach the two audio tracks: yours and the patient&apos;s.</li>
            <li>Start transcription. The engine writes each track out and puts the turns in order.</li>
            <li>Check the transcript. Words the engine is unsure of are marked.</li>
          </ol>
        </aside>
      </div>
    </>
  );
}
