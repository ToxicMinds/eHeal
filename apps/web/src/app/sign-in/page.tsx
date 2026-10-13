"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Wordmark } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1.15fr_1fr] md:py-16">
      <section aria-labelledby="what-it-does">
        <Wordmark className="text-5xl" />
        <h1 id="what-it-does" className="mt-6 max-w-md text-2xl leading-snug font-semibold">
          Turn a consultation&apos;s two audio tracks into a transcript you can check and correct.
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Each speaker keeps their own voice. Every uncertain word is marked. Nothing is filled in.
        </p>
        <SampleTranscript />
      </section>

      <section aria-labelledby="sign-in" className="self-start rounded-xl border bg-card p-6 shadow-sm">
        <h2 id="sign-in" className="text-xl font-semibold">
          Sign in
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts are created by the project owner. There is no public sign-up.
        </p>
        <form onSubmit={handleSubmit(signIn)} noValidate className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" className="text-sm font-semibold text-madder">
                Problem: {errors.email.message}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p id="password-error" className="text-sm font-semibold text-madder">
                Problem: {errors.password.message}
              </p>
            )}
          </div>
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>Problem: {failure}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}

const SAMPLE = [
  { at: "0:02.5", speaker: "Patient", text: "I have not been sleeping properly for around three weeks." },
  { at: "0:09.1", speaker: "Practitioner", text: "And when you do wake, what time is it usually?" },
] as const;

/** An invented exchange that shows what review looks like: two voices and one honest doubt. */
function SampleTranscript() {
  return (
    <figure className="mt-8 max-w-md">
      <figcaption className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Invented example
      </figcaption>
      <ol className="mt-3 grid gap-3">
        {SAMPLE.map((line) => (
          <SampleLine key={line.at} at={line.at} speaker={line.speaker}>
            {line.text}
          </SampleLine>
        ))}
        <SampleLine at="0:13.4" speaker="Patient">
          About four in the morning. I take{" "}
          <mark className="rounded-sm bg-turmeric-tint px-0.5 text-turmeric-ink underline decoration-turmeric decoration-2 underline-offset-4">
            ashwagandha
          </mark>{" "}
          at night.
          <span className="mt-1 block text-sm text-turmeric-ink">
            Low confidence. Check this word against the audio.
          </span>
        </SampleLine>
      </ol>
    </figure>
  );
}

function SampleLine({
  at,
  speaker,
  children,
}: {
  at: string;
  speaker: "Patient" | "Practitioner";
  children: React.ReactNode;
}) {
  const voice = speaker === "Patient" ? "border-patient text-patient" : "border-practitioner text-practitioner";
  return (
    <li className={`grid grid-cols-[3.5rem_1fr] gap-x-3 border-l-4 pl-3 ${voice.split(" ")[0]}`}>
      <span className="pt-0.5 font-mono text-sm text-muted-foreground">{at}</span>
      <div>
        <span className={`text-sm font-semibold ${voice.split(" ")[1]}`}>{speaker}</span>
        <p className="text-foreground">{children}</p>
      </div>
    </li>
  );
}
