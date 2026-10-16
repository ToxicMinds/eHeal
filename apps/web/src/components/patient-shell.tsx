"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";

/** Frame for the pages patients use without an account: the front page and booking. */
export function PatientShell({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <>
      <header className="wa-header">
        <div className="wa-header__inner">
          <Link href="/" className="wa-wordmark" aria-label="Watson, find a practitioner">Watson</Link>
          {session.status === "signed-in"
            ? <Link href="/consultations/" className="wa-crumb">Your consultations</Link>
            : <Link href="/sign-in/" className="wa-crumb">Practitioner sign-in</Link>}
        </div>
      </header>
      <main className="wa-page">{children}</main>
    </>
  );
}
