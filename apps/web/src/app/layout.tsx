import type { Metadata } from "next";
import "@fontsource-variable/eczar";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { LISTED, SITE_URL } from "@/lib/site";

const TITLE = "Watson · Ayurveda and integrative care by video";
const DESCRIPTION = "Find an Ayurveda or integrative care practitioner, choose a time that suits you, pay online and meet by video. Send lab results before the call.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Watson" },
  description: DESCRIPTION,
  applicationName: "Watson",
  openGraph: { siteName: "Watson", type: "website", locale: "en", title: TITLE, description: DESCRIPTION },
  robots: { index: LISTED, follow: LISTED },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
