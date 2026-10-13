"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { call, explain } from "@/lib/api";
import { RequireSession } from "@/lib/session";
import { LANGUAGE_LABEL } from "@/lib/status";

const schema = z.object({
  synthetic_patient_ref: z
    .string()
    .regex(/^SYN-\d{1,8}$/, "Use SYN- and up to eight digits, for example SYN-0042. Real names and identifiers are not accepted."),
  scheduled_at: z.string().min(1, "Choose the date and time of the consultation."),
  language: z.enum(["en", "de", "sk", "auto"], "Choose the language of the consultation."),
  consent_recorded: z.boolean(),
  scenario_notes: z.string().max(500, "Keep the notes under 500 characters."),
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
    defaultValues: { synthetic_patient_ref: "SYN-", scheduled_at: "", consent_recorded: false, scenario_notes: "" },
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
      p_synthetic_patient_ref: values.synthetic_patient_ref,
      p_scheduled_at: new Date(values.scheduled_at).toISOString(),
      p_language: values.language,
      p_consent_recorded: values.consent_recorded,
      p_scenario_notes: values.scenario_notes,
    });
    if (outcome.ok) router.push(`/consultation/?id=${outcome.consultation_id}`);
    else setFailure(explain(outcome.error_category));
  }

  const problem = (id: string, message?: string) =>
    message && (
      <p id={id} className="text-sm font-semibold text-madder">
        Problem: {message}
      </p>
    );

  return (
    <>
      <p className="text-sm">
        <Link href="/consultations/" className="underline underline-offset-4">Consultations</Link>
      </p>
      <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight">New consultation</h1>
      <form onSubmit={handleSubmit(create)} noValidate className="mt-6 grid max-w-xl gap-5 rounded-xl border bg-card p-6">
        <div className="grid gap-1.5">
          <Label htmlFor="ref">Synthetic patient reference</Label>
          <Input id="ref" className="font-mono" autoComplete="off" spellCheck={false}
            aria-invalid={Boolean(errors.synthetic_patient_ref)} aria-describedby="ref-help ref-error"
            {...register("synthetic_patient_ref")} />
          <p id="ref-help" className="text-sm text-muted-foreground">
            An invented reference such as SYN-0042. Never a real name or identifier.
          </p>
          {problem("ref-error", errors.synthetic_patient_ref?.message)}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="when">Date and time</Label>
            <Input id="when" type="datetime-local" aria-invalid={Boolean(errors.scheduled_at)}
              aria-describedby="when-error" {...register("scheduled_at")} />
            {problem("when-error", errors.scheduled_at?.message)}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="language">Language spoken</Label>
            <select id="language" defaultValue="" aria-invalid={Boolean(errors.language)}
              aria-describedby="language-help language-error"
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              {...register("language")}>
              <option value="" disabled>Choose…</option>
              {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            {problem("language-error", errors.language?.message)}
          </div>
        </div>
        <p id="language-help" className="-mt-3 text-sm text-muted-foreground">
          The transcript is made in this language. &ldquo;Mixed or unsure&rdquo; lets the engine guess,
          which is less reliable.
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes about the invented scenario</Label>
          <Textarea id="notes" rows={3} aria-invalid={Boolean(errors.scenario_notes)}
            aria-describedby="notes-help notes-error" {...register("scenario_notes")} />
          <p id="notes-help" className="text-sm text-muted-foreground">
            For example &ldquo;sleep complaint, patient mentions a supplement&rdquo;. Nothing about a real person.
          </p>
          {problem("notes-error", errors.scenario_notes?.message)}
        </div>

        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-practitioner" {...register("consent_recorded")} />
          <span>
            <span className="font-semibold">Consent to transcription is recorded</span>
            <span className="block text-sm text-muted-foreground">
              For this invented consultation. Without it, no audio can be attached or transcribed.
              You can record it later.
            </span>
          </span>
        </label>

        {failure && (
          <Alert variant="destructive"><AlertDescription>Problem: {failure}</AlertDescription></Alert>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create consultation"}
          </Button>
          <Button variant="outline" asChild><Link href="/consultations/">Cancel</Link></Button>
        </div>
      </form>
    </>
  );
}
