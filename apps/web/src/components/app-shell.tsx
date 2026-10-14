"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";

/** Frame for every signed-in screen: who is signed in, and a way out. */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <>
      <header className="wa-header">
        <div className="wa-header__inner">
          <Link href="/consultations/" className="wa-wordmark" aria-label="Watson, consultations">Watson</Link>
          <div className="wa-account">
            <span className="wa-account__email">Signed in as <strong>{user.email}</strong></span>
            <button type="button" className="wa-button wa-button--secondary wa-button--small"
              onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="wa-page">{children}</main>
    </>
  );
}
