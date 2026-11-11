// Copy-to-clipboard helpers. copyText can also put an HTML version on the clipboard,
// which is what makes a pasted plan show up as a real table in Teams or email.
import { useState } from "react";

export async function copyText(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API: select hidden text and copy it.
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy no-print"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}
