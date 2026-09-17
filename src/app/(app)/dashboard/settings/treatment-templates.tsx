"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Treatment } from "@/lib/treatments";
import { formatPriceIls } from "@/lib/plan";
import { useI18n } from "@/i18n/client";

/**
 * The menu a therapist picks from when asking a client to pay after a session.
 * Small on purpose: a name and a price, add, remove. Ordering is by creation;
 * a therapist with more than a handful of treatments is not who this is for.
 */
export function TreatmentTemplates({ initial }: { initial: Treatment[] }) {
  const { m, locale } = useI18n();
  const t = m.treatments;
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceIls = Number(price);
    if (!name.trim() || !Number.isFinite(priceIls) || priceIls <= 0) {
      setError(t.invalid);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/treatments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), priceIls: Math.round(priceIls * 100) / 100 }),
      });
      const data = (await res.json()) as { treatment?: Treatment; error?: string };
      if (!res.ok || !data.treatment) {
        setError(data.error ?? m.common.genericError);
        return;
      }
      setItems((prev) => [...prev, data.treatment!]);
      setName("");
      setPrice("");
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/me/treatments/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError(m.common.genericError);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <Card className="text-center md:text-start">
      <CardHeader>
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>{t.lead}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.empty}</p>
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">{item.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">{formatPriceIls(item.priceIls, locale)}</span>
                  <Button type="button" variant="ghost" size="sm" aria-label={t.remove} onClick={() => remove(item.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="flex flex-col gap-2 text-start">
            <Label htmlFor="treatment-name">{t.name}</Label>
            <Input
              id="treatment-name"
              value={name}
              maxLength={80}
              placeholder={t.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 text-start">
            <Label htmlFor="treatment-price">{t.price}</Label>
            <Input
              id="treatment-price"
              type="number"
              inputMode="decimal"
              min={1}
              step={0.01}
              dir="ltr"
              className="sm:w-32"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? t.adding : t.add}
          </Button>
        </form>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}
