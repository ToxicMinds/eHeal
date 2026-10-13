"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-heading font-semibold tracking-tight text-practitioner ${className}`}>
      eHeal
    </span>
  );
}

/** Frame for every signed-in screen: who is signed in, and a way out. */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/consultations/" aria-label="eHeal, consultations">
            <Wordmark className="text-3xl" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{user.email}</span>
            </span>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
