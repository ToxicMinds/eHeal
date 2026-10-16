import Link from "next/link";
import type { ReactNode } from "react";

/** Frame for the pages patients use without an account: finding a practitioner and booking. */
export function PatientShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="wa-header">
        <div className="wa-header__inner">
          <Link href="/find/" className="wa-wordmark" aria-label="Watson, find a practitioner">Watson</Link>
          <Link href="/sign-in/" className="wa-crumb">Practitioner sign-in</Link>
        </div>
      </header>
      <main className="wa-page">{children}</main>
    </>
  );
}
