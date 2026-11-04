"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { formatPriceIls } from "@/lib/plan";

/**
 * Enter a coupon code. Applied at once (POST /api/me/coupon) — in the signup
 * wizard and on the subscription page alike — and from then on the account's
 * monthly price is the coupon's. Once a code is on the account the field
 * turns into the confirmation.
 */
export function CouponField({
  initialCode,
  initialPriceIls,
  onApplied,
}: {
  initialCode: string | null;
  initialPriceIls: number | null;
  onApplied?: (priceIls: number) => void;
}) {
  const { m, locale } = useI18n();
  const t = m.coupon;
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; priceIls: number } | null>(
    initialCode && initialPriceIls !== null ? { code: initialCode, priceIls: initialPriceIls } : null
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 429 ? t.tooMany : t.invalid);
        return;
      }
      setApplied({ code: data.code, priceIls: data.priceIls });
      onApplied?.(data.priceIls);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div role="status" className="bg-st-open-bg text-st-open flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
        <Check className="mt-0.5 size-4 shrink-0" />
        <span>
          {t.applied(applied.code)} <strong>{t.yourPrice(formatPriceIls(applied.priceIls, locale))}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-start">
      <Label htmlFor="coupon">{t.label}</Label>
      <div className="flex gap-2">
        <Input
          id="coupon"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim()) {
              e.preventDefault();
              void apply();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => void apply()}>
          {t.apply}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
