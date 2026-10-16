import type { Metadata } from "next";
import { FindPractitioners } from "@/components/find-practitioners";

// The front page, for patients: find a practitioner. Also Watson's shop window for search engines.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function FrontPage() {
  return <FindPractitioners />;
}
