"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Scope = "slots" | "everything";

/** Typed by hand for the destructive scope — a click alone is too cheap here. */
const CONFIRM_WORD = "אפס";

export function ResetSchedule({ scope }: { scope: Scope }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("האיפוס נכשל. נסה שוב.");
        return;
      }
      setDone(
        scope === "slots"
          ? `נמחקו ${data.sessions} חלונות ו-${data.rules} כללים.`
          : `נמחקו ${data.sessions} חלונות, ${data.bookings} תורים ו-${data.clients} לקוחות.`
      );
      setConfirming(false);
      setTyped("");
      router.refresh();
    } catch {
      setError("שגיאת רשת, נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  if (scope === "slots") {
    return (
      <div className="flex flex-col items-center gap-2 md:items-start">
        {done && <p className="text-st-open text-sm">{done}</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {confirming ? (
          <div className="flex flex-col items-center gap-2 sm:flex-row md:items-start">
            <p className="text-sm">למחוק את כל החלונות הפנויים והחסומים?</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={run}>
                {busy ? "מוחק..." : "כן, נקה"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            נקה את כל החלונות
          </Button>
        )}
        <p className="text-muted-foreground text-xs">
          תורים שכבר הוזמנו לא יימחקו. גם הכללים החוזרים יוסרו, אחרת הם ימלאו את הלוח מחדש.
        </p>
      </div>
    );
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-lg border p-4 text-center md:text-start">
      <div className="flex flex-col items-center gap-2 md:flex-row md:items-center">
        <TriangleAlert className="text-destructive size-5" />
        <p className="font-medium">איפוס מלא של החשבון</p>
      </div>
      <p className="text-muted-foreground text-sm">
        מוחק את כל החלונות, כל התורים שנקבעו וכל רשומות הלקוחות. הפרופיל, ההגדרות והקישור הציבורי
        שלך נשארים. <strong className="text-foreground">אין דרך לשחזר.</strong>
      </p>

      {done && <p className="text-st-open text-sm">{done}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {confirming ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="reset-confirm" className="text-sm">
            כדי לאשר, הקלד <strong>{CONFIRM_WORD}</strong>
          </label>
          <Input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="max-w-40"
          />
          <div className="flex flex-col justify-center gap-2 sm:flex-row md:justify-start">
            <Button
              type="button"
              variant="destructive"
              disabled={busy || typed.trim() !== CONFIRM_WORD}
              onClick={run}
            >
              {busy ? "מאפס..." : "אפס הכול"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center md:justify-start">
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            אפס את החשבון
          </Button>
        </div>
      )}
    </div>
  );
}
