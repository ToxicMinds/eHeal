"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AudioLines, CalendarCheck, CircleAlert, ClipboardCheck, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Notice } from "@/components/status";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.email("Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export default function SignIn() {
  const session = useSession();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (session.status === "signed-in") router.replace("/consultations/");
  }, [session.status, router]);

  async function signIn(values: Values) {
    setFailure(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (!error) return; // the session listener redirects
    // The same message whether or not the email exists.
    setFailure(
      error.status === 400
        ? "That email and password do not match an account."
        : "Sign-in is not available right now. Try again in a moment.",
    );
  }

  return (
    <main className="wa-signin">
      <section className="wa-hero" aria-labelledby="what-it-does">
        <span className="wa-wordmark">Watson</span>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 id="what-it-does" className="wa-hero__title">Every doctor deserves a Watson.</h1>
          <p className="wa-hero__meta">You see the patient. Watson does the paperwork.</p>
        </div>
        <ol className="wa-promise">
          <li><span className="wa-promise__icon"><CalendarCheck aria-hidden className="wa-icon" /></span><p className="wa-promise__title">Booked and paid</p><p className="wa-promise__text">Patients choose you, pick a time and pay online.</p></li>
          <li><span className="wa-promise__icon"><Video aria-hidden className="wa-icon" /></span><p className="wa-promise__title">Meet by video</p><p className="wa-promise__text">A private call in the browser. Nothing to install.</p></li>
          <li><span className="wa-promise__icon"><AudioLines aria-hidden className="wa-icon" /></span><p className="wa-promise__title">Watson takes the notes</p><p className="wa-promise__text">Every word written down, in English, German or Slovak.</p></li>
          <li><span className="wa-promise__icon"><ClipboardCheck aria-hidden className="wa-icon" /></span><p className="wa-promise__title">Your form, filled in</p><p className="wa-promise__text">Watson answers your questionnaire with quotes from the call. You check and approve.</p></li>
        </ol>
      </section>

      <section className="wa-panel" aria-labelledby="sign-in">
        <h2 id="sign-in" className="wa-heading">Sign in</h2>
        <p className="wa-hint">Accounts are made by the project owner. There is no public sign-up.</p>
        <form onSubmit={handleSubmit(signIn)} noValidate className="wa-form" style={{ gap: 16 }}>
          <div className="wa-field">
            <label className="wa-label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="wa-input"
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")} />
            {errors.email && <p id="email-error" className="wa-error"><CircleAlert aria-hidden className="wa-icon" />{errors.email.message}</p>}
          </div>
          <div className="wa-field">
            <label className="wa-label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="wa-input"
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")} />
            {errors.password && <p id="password-error" className="wa-error"><CircleAlert aria-hidden className="wa-icon" />{errors.password.message}</p>}
          </div>
          {failure && <Notice tone="failed" title="Not signed in">{failure}</Notice>}
          <button type="submit" className="wa-button wa-button--primary" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

