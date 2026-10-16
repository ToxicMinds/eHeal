import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static"; // written once at build: the site is static files

// Patients' pages may be crawled; the practitioners' workspace and patients' private links never.
const PRIVATE = ["/consultations/", "/consultation/", "/calendar/", "/form/", "/room/", "/join/", "/j/", "/sign-in/"];

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/book/"], disallow: PRIVATE }, sitemap: `${SITE_URL}/sitemap.xml` };
}
