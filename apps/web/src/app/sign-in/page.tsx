"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
      <section className="wa-thesis" aria-labelledby="what-it-does">
        <span className="wa-wordmark">Watson</span>
        <h1 id="what-it-does" className="wa-thesis__lead">
          Turn a consultation&apos;s two audio tracks into a transcript you can check and correct.
        </h1>
        <p className="wa-text wa-meta">
          Each voice keeps its own track. Every word the machine is unsure of is marked for you. Nothing is filled in.
        </p>
        <figure className="wa-sample" aria-label="Example" style={{ margin: 0 }}>
          <ol className="wa-turns">
            <SampleTurn speaker="patient" at="0:04.2">I have not been sleeping properly for around three weeks.</SampleTurn>
            <SampleTurn speaker="practitioner" at="0:11.0">And when you do wake, what time is it usually?</SampleTurn>
            <SampleTurn speaker="patient" at="0:14.6">
              About four in the morning. I take <mark className="wa-unsure">ashwagandha</mark> at night.
            </SampleTurn>
          </ol>
        </figure>
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

function SampleTurn({ speaker, at, children }: { speaker: "patient" | "practitioner"; at: string; children: ReactNode }) {
  return (
    <li className={`wa-turn wa-turn--${speaker}`}>
      <div className="wa-turn__body">
        <p className="wa-turn__head">
          <span className="wa-turn__who">{speaker === "patient" ? "Patient" : "Practitioner"}</span>
          <span className="wa-turn__time">{at}</span>
        </p>
        <p className="wa-turn__text">{children}</p>
      </div>
    </li>
  );
}
