"use client";

import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PatientShell } from "@/components/patient-shell";
import { Notice } from "@/components/status";
import { initials, type PublicPage } from "@/lib/booking";
import { euros } from "@/lib/fee";
import { dateTime, LANGUAGE_LABEL, type ConsultationLanguage } from "@/lib/status";
import { call } from "@/lib/api";

// Patients find a practitioner (design system: ScreenFind, ScreenPhoneFind). No account needed.

type Listed = PublicPage & { next_free: string | null };
const LANGUAGES: ConsultationLanguage[] = ["en", "sk", "de"];

export default function FindPage() {
  const [listed, setListed] = useState<Listed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [language, setLanguage] = useState<ConsultationLanguage | "">("");

  useEffect(() => {
    call<{ practitioners: Listed[] }>("find_practitioners").then((answer) => (answer.ok ? setListed(answer.practitioners) : setFailed(true)));
  }, []);

  const shown = listed?.filter((p) => !language || p.languages.includes(language)) ?? [];
  return (
    <PatientShell>
      <section className="wa-hero" aria-labelledby="find">
        <div style={{ display: "grid", gap: 6 }}>
          <p className="wa-hero__eyebrow">Consultations by video</p>
          <h1 className="wa-hero__title" id="find">Find a practitioner</h1>
          <p className="wa-hero__meta">Ayurveda and integrative care. Choose a time that suits you, pay online, and meet by video. You can send lab results before the call.</p>
        </div>
        <div className="wa-field" style={{ maxWidth: 320 }}>
          <label className="wa-label" htmlFor="speaks" style={{ color: "inherit" }}>Speaks</label>
          <div className="wa-select">
            <select id="speaks" value={language} onChange={(e) => setLanguage(e.target.value as ConsultationLanguage | "")}>
              <option value="">Any language</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>)}
            </select>
          </div>
        </div>
      </section>
      {failed ? (
        <Notice tone="failed" title="The practitioners could not be loaded">Check your connection and reload the page.</Notice>
      ) : listed === null ? (
        <p className="wa-meta" role="status">Finding practitioners…</p>
      ) : shown.length === 0 ? (
        <Notice title="No practitioner matches">Try another language.</Notice>
      ) : (
        <>
          <p className="wa-meta">{shown.length === 1 ? "One practitioner" : `${shown.length} practitioners`}</p>
          <div className="wa-people">
            {shown.map((p) => (
              <article key={p.slug} className="wa-person" aria-labelledby={`p-${p.slug}`}>
                <div className="wa-person__top">
                  <span className="wa-monogram" aria-hidden>{initials(p.display_name)}</span>
                  <div><h2 className="wa-person__name" id={`p-${p.slug}`}>{p.display_name}</h2><p className="wa-person__what">{p.offer}</p></div>
                </div>
                <ul className="wa-facts">
                  <li>{p.languages.map((l) => LANGUAGE_LABEL[l]).join(", ")}</li>
                  <li>{p.length_minutes} min by video</li>
                  <li>{p.fee_cents === null ? "Free" : euros(p.fee_cents)}</li>
                </ul>
                <p className="wa-next"><Clock aria-hidden className="wa-icon wa-icon--sm" />
                  {p.next_free ? `Next free: ${dateTime(p.next_free)}` : "No free times in the next four weeks"}</p>
                <Link className="wa-button wa-button--secondary" href={`/book/?p=${p.slug}`} style={{ justifySelf: "start" }}>
                  See times<ArrowRight aria-hidden className="wa-icon wa-icon--sm" />
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </PatientShell>
  );
}
