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
    <main className="eh-signin">
      <section className="eh-thesis" aria-labelledby="what-it-does">
        <span className="eh-wordmark">eHeal</span>
        <h1 id="what-it-does" className="eh-thesis__lead">
          Turn a consultation&apos;s two audio tracks into a transcript you can check and correct.
        </h1>
        <p className="eh-text eh-meta">
          Each voice keeps its own track. Every word the machine is unsure of is marked for you. Nothing is filled in.
        </p>
        <figure className="eh-sample" aria-label="Example" style={{ margin: 0 }}>
          <ol className="eh-turns">
            <SampleTurn speaker="patient" at="0:04.2">I have not been sleeping properly for around three weeks.</SampleTurn>
            <SampleTurn speaker="practitioner" at="0:11.0">And when you do wake, what time is it usually?</SampleTurn>
            <SampleTurn speaker="patient" at="0:14.6">
              About four in the morning. I take <mark className="eh-unsure">ashwagandha</mark> at night.
            </SampleTurn>
          </ol>
        </figure>
      </section>

      <section className="eh-panel" aria-labelledby="sign-in">
        <h2 id="sign-in" className="eh-heading">Sign in</h2>
        <p className="eh-hint">Accounts are made by the project owner. There is no public sign-up.</p>
        <form onSubmit={handleSubmit(signIn)} noValidate className="eh-form" style={{ gap: 16 }}>
          <div className="eh-field">
            <label className="eh-label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="eh-input"
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")} />
            {errors.email && <p id="email-error" className="eh-error"><CircleAlert aria-hidden className="eh-icon" />{errors.email.message}</p>}
          </div>
          <div className="eh-field">
            <label className="eh-label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="eh-input"
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")} />
            {errors.password && <p id="password-error" className="eh-error"><CircleAlert aria-hidden className="eh-icon" />{errors.password.message}</p>}
          </div>
          {failure && <Notice tone="failed" title="Not signed in">{failure}</Notice>}
          <button type="submit" className="eh-button eh-button--primary" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function SampleTurn({ speaker, at, children }: { speaker: "patient" | "practitioner"; at: string; children: ReactNode }) {
  return (
    <li className={`eh-turn eh-turn--${speaker}`}>
      <div className="eh-turn__body">
        <p className="eh-turn__head">
          <span className="eh-turn__who">{speaker === "patient" ? "Patient" : "Practitioner"}</span>
          <span className="eh-turn__time">{at}</span>
        </p>
        <p className="eh-turn__text">{children}</p>
      </div>
    </li>
  );
}
