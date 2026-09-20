"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { LOCATION_TYPES } from "@/lib/onboarding-schema";
import { LOCATION_COLORS, locationSchema, type Location, type LocationInput } from "@/lib/location-schema";

type Draft = {
  name: string;
  type: LocationInput["type"];
  address: string;
  onlineMeetingUrl: string;
  notes: string;
  color: string;
};

const EMPTY: Draft = { name: "", type: "clinic", address: "", onlineMeetingUrl: "", notes: "", color: "" };

function draftOf(location: Location): Draft {
  return {
    name: location.name,
    type: location.type,
    address: location.address ?? "",
    onlineMeetingUrl: location.onlineMeetingUrl ?? "",
    notes: location.notes ?? "",
    color: location.color,
  };
}

/**
 * The therapist's places. One is the common case and reads as a single
 * address card; the second one is what turns the calendar into colours and
 * hands each clinic its own link.
 */
export function LocationsCard({ initial }: { initial: Location[] }) {
  const { m, issue } = useI18n();
  const t = m.locations;
  const [locations, setLocations] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(draft: Draft, id: string | null) {
    setError(null);
    const parsed = locationSchema.safeParse(draft);
    if (!parsed.success) {
      setError(issue(parsed.error.issues[0]?.message) || t.invalid);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(id ? `/api/me/locations/${id}` : "/api/me/locations", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as { location?: Location; error?: string };
      if (!res.ok || !data.location) {
        setError(data.error || t.saveError);
        return;
      }
      const saved = data.location;
      setLocations((prev) => (id ? prev.map((l) => (l.id === id ? saved : l)) : [...prev, saved]));
      setEditingId(null);
      setAdding(false);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/me/locations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error === "LAST_LOCATION" ? t.lastLocation : t.archiveError);
        return;
      }
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setConfirmingId(null);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.lead}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        <ul className="flex flex-col gap-2">
          {locations.map((location) => (
            <li key={location.id} className="rounded-md border px-3 py-2 text-sm">
              {editingId === location.id ? (
                <LocationForm
                  initial={draftOf(location)}
                  busy={busy}
                  submitLabel={t.save}
                  busyLabel={t.saving}
                  onSubmit={(draft) => save(draft, location.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : confirmingId === location.id ? (
                <div className="flex flex-col gap-2">
                  <p>{t.archiveQuestion(location.name)}</p>
                  <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => archive(location.id)}>
                      {t.archiveConfirm}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                      {m.common.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: location.color }} aria-hidden />
                    <span className="flex min-w-0 flex-col text-start">
                      <span className="font-medium">{location.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {m.labels.location[location.type]}
                        {location.address ? ` · ${location.address}` : ""}
                        {!location.address && location.onlineMeetingUrl ? ` · ${location.onlineMeetingUrl}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-center gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setEditingId(location.id); setAdding(false); }}>
                      {t.edit}
                    </Button>
                    {locations.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingId(location.id)}>
                        <Trash2 className="size-4" />
                        {t.archive}
                      </Button>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="rounded-md border px-3 py-3 text-sm">
            <LocationForm
              initial={{ ...EMPTY, color: LOCATION_COLORS[locations.length % LOCATION_COLORS.length] }}
              busy={busy}
              submitLabel={t.add}
              busyLabel={t.adding}
              onSubmit={(draft) => save(draft, null)}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full md:w-fit" disabled={busy} onClick={() => { setAdding(true); setEditingId(null); }}>
            {t.addButton}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LocationForm({
  initial,
  busy,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.locations;
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const wantsAddress = draft.type === "clinic" || draft.type === "client_home" || draft.type === "hybrid";
  const wantsUrl = draft.type === "online" || draft.type === "hybrid";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="loc-name">{t.name}</Label>
          <Input id="loc-name" value={draft.name} maxLength={80} placeholder={t.namePlaceholder} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="loc-type">{t.type}</Label>
          <Select value={draft.type} onValueChange={(v) => set("type", v as Draft["type"])}>
            <SelectTrigger id="loc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {m.labels.location[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {wantsAddress && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="loc-address">{t.address}</Label>
          <Input id="loc-address" value={draft.address} maxLength={500} onChange={(e) => set("address", e.target.value)} />
        </div>
      )}
      {wantsUrl && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="loc-url">{t.meetingUrl}</Label>
          <Input id="loc-url" dir="ltr" value={draft.onlineMeetingUrl} maxLength={500} onChange={(e) => set("onlineMeetingUrl", e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="loc-notes">{t.notes}</Label>
        <Input id="loc-notes" value={draft.notes} maxLength={500} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>{t.color}</Label>
        <div className="flex flex-wrap justify-center gap-2 md:justify-start">
          {LOCATION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={draft.color === color}
              onClick={() => set("color", color)}
              className={cn(
                "size-8 rounded-full border-2 transition-transform",
                draft.color === color ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 md:justify-start">
        <Button type="button" size="sm" disabled={busy} onClick={() => onSubmit(draft)}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          {m.common.cancel}
        </Button>
      </div>
    </div>
  );
}
