"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/**
 * The "what's new" notice (src/lib/whats-new.ts), opened over the dashboard the
 * first time it is seen. A native <dialog>: it traps focus, closes on Esc and
 * dims the page itself. Closing it any way records that it was seen.
 */
export function WhatsNew() {
  const { m } = useI18n();
  const t = m.whatsNew;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function seen() {
    // Best effort: if it fails the notice simply shows once more.
    void fetch("/api/me/whats-new", { method: "POST" }).catch(() => {});
  }

  return (
    <dialog
      ref={ref}
      onClose={seen}
      aria-labelledby="whats-new-title"
      className="bg-card text-card-foreground border-border m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border p-5 text-start shadow-xl backdrop:bg-black/50"
    >
      <h2 id="whats-new-title" className="text-xl font-bold">
        {t.title}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">{t.lead}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {t.items.map((item) => (
          <li key={item.title}>
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-muted-foreground text-sm">{item.body}</p>
          </li>
        ))}
      </ul>
      <Button type="button" className="mt-5 w-full" onClick={() => ref.current?.close()}>
        {t.close}
      </Button>
    </dialog>
  );
}
