"use client";

import { useState } from "react";
import { buttonClass, cx } from "./ui";

/** Copia um texto. Fora de contexto seguro (http na rede local) usa o método antigo do navegador. */
export function CopyButton({ text, label = "Copiar", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState<"ok" | "fail" | null>(null);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) throw new Error("copy failed");
      }
      setDone("ok");
    } catch {
      setDone("fail");
    }
    setTimeout(() => setDone(null), 2500);
  }
  return (
    <button type="button" onClick={copy} className={cx(buttonClass("secondary", "sm"), className)}>
      {done === "ok" ? "Copiado" : done === "fail" ? "Não deu para copiar" : label}
    </button>
  );
}
