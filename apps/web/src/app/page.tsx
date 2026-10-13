"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

export default function Home() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "signed-in") router.replace("/consultations/");
    if (session.status === "signed-out") router.replace("/sign-in/");
  }, [session.status, router]);

  return (
    <p role="status" className="p-8 text-muted-foreground">
      Opening eHeal…
    </p>
  );
}
