"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusRail } from "@/components/status-rail";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/lib/database.types";
import { RequireSession } from "@/lib/session";
import { LANGUAGE_LABEL } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Row = Pick<
  Tables<"consultations">,
  "id" | "synthetic_patient_ref" | "scheduled_at" | "language" | "status"
>;

export default function ConsultationsPage() {
  return <RequireSession>{(user) => <AppShell user={user}><ConsultationList /></AppShell>}</RequireSession>;
}

function ConsultationList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Row-level security returns only the signed-in practitioner's consultations.
    supabase
      .from("consultations")
      .select("id, synthetic_patient_ref, scheduled_at, language, status")
      .order("scheduled_at", { ascending: false })
      .then(({ data, error }) => (error ? setFailed(true) : setRows(data)));
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Consultations</h1>
        <Button asChild><Link href="/consultations/new/">New consultation</Link></Button>
      </div>
      <div className="mt-6">
        {failed ? (
          <Alert variant="destructive">
            <AlertDescription>
              Problem: your consultations could not be loaded. Check your connection and reload the page.
            </AlertDescription>
          </Alert>
        ) : rows === null ? (
          <p role="status" className="text-muted-foreground">
            Loading your consultations…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground">
            No consultations yet. Create an invented one to try the workflow.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left">
              <caption className="sr-only">Your consultations, newest first</caption>
              <thead className="border-b text-sm text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Patient reference</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Language</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-mono">
                      <Link href={`/consultation/?id=${row.id}`} className="font-semibold text-practitioner underline underline-offset-4">
                        {row.synthetic_patient_ref}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatWhen(row.scheduled_at)}</td>
                    <td className="px-4 py-3">{LANGUAGE_LABEL[row.language]}</td>
                    <td className="px-4 py-3"><StatusRail status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Stored in UTC, shown in the viewer's own time zone.
const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function formatWhen(iso: string) {
  return WHEN.format(new Date(iso));
}
