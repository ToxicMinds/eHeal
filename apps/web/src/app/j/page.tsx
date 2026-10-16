"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PatientShell } from "@/components/patient-shell";
import { Notice } from "@/components/status";
import { call } from "@/lib/api";

// A short link, /j/K7P4QX9M, read out or typed by hand: finds the patient's page and opens it.
// The static site serves this page for every /j/... address (serve.json locally, a rewrite on Render).

export default function ShortLinkPage() {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const code = window.location.pathname.replace(/^\/j\/?/, "").replace(/\/$/, "");
    call<{ token: string }>("open_short_link", { p_code: decodeURIComponent(code) }).then((answer) => {
      if (answer.ok) router.replace(`/join/?t=${answer.token}`);
      else setMissing(true);
    });
  }, [router]);

  return (
    <PatientShell>
      {missing ? (
        <Notice title="This link does not lead to a consultation">
          Check the letters and numbers with your practitioner, or ask them to send the link again.
        </Notice>
      ) : (
        <p className="wa-meta" role="status">Opening your consultation…</p>
      )}
    </PatientShell>
  );
}
