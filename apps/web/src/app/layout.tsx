import type { Metadata } from "next";
import "@fontsource-variable/eczar";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "eHeal", template: "%s · eHeal" },
  description:
    "Consultation documentation workspace. Development proof of concept with invented data only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {/* Required on every screen: MASTER_BUILD_SPEC.md section 14.1. */}
        <p
          role="note"
          className="border-b-2 border-turmeric bg-turmeric-tint px-4 py-2 text-center text-sm text-turmeric-ink"
        >
          <strong>Development proof of concept. Invented data only.</strong> Never enter a real
          patient&apos;s details or a real consultation.
        </p>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
