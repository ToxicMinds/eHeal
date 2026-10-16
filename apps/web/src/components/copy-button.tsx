"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

/** Copies text (a link) to the clipboard and says so for two seconds. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="wa-button wa-button--secondary" onClick={copy}>
      <Copy aria-hidden className="wa-icon" />{copied ? "Copied" : "Copy link"}
    </button>
  );
}
