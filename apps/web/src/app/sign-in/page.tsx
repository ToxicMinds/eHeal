"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
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
    <main className="wa-night">
      <div className="wa-door">
        <header className="wa-door__head">
          <span className="wa-wordmark">Watson</span>
          <h1 className="wa-door__title">Every doctor deserves a&nbsp;Watson.</h1>
          <p className="wa-door__lead">You see the patient. Watson does the paperwork.</p>
        </header>

        <section className="wa-panel wa-door__card" aria-labelledby="sign-in">
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

        <figure className="wa-notebook">
          <figcaption className="wa-notebook__title">From Watson&apos;s notebook</figcaption>
          <ol>
            <li><time>08:12</time><span>Booked for 09:30 and paid, €40.00</span></li>
            <li><time>09:30</time><span>Video call with the patient, 32 minutes</span></li>
            <li><time>10:03</time><span>Notes written: every word, both voices</span></li>
            <li><time>10:06</time><span>Your form filled in: 18 of 21 answers, each with its quote</span></li>
            <li className="is-now"><time>Now</time><span>Waiting for you to check and approve</span></li>
          </ol>
        </figure>
      </div>
    </main>
  );
}

