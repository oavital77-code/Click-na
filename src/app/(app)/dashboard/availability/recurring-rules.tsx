"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { DURATION_OPTIONS } from "@/lib/onboarding-schema";
import { LocationDot, LocationSelect, type PlaceOption } from "@/components/location-filter";

type Rule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  futureOpenCount: number;
  futureBookedCount: number;
  locationId: string;
  locationName: string;
  locationColor: string;
};

export function RecurringRules({ initialRules, locations }: { initialRules: Rule[]; locations: PlaceOption[] }) {
  const { m } = useI18n();
  const r = m.availability.rules;
  const manyPlaces = locations.length > 1;
  const [rules, setRules] = useState(initialRules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("17:00");
  const [editDuration, setEditDuration] = useState(50);
  const [editPlace, setEditPlace] = useState("");

  const [addingDays, setAddingDays] = useState<number[]>([]);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("17:00");
  const [addDuration, setAddDuration] = useState(50);
  const [addPlace, setAddPlace] = useState(locations[0]?.id ?? "");
  const [adding, setAdding] = useState(false);

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditStart(rule.startTime);
    setEditEnd(rule.endTime);
    setEditDuration(rule.slotDurationMinutes);
    setEditPlace(rule.locationId);
    setError(null);
  }

  async function saveEdit(rule: Rule) {
    setBusyId(rule.id);
    setError(null);
    try {
      const res = await fetch(`/api/availability-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: editStart,
          endTime: editEnd,
          slotDurationMinutes: editDuration,
          isActive: rule.isActive,
          locationId: manyPlaces && editPlace !== rule.locationId ? editPlace : undefined,
        }),
      });
      if (!res.ok) {
        setError(r.saveError);
        return;
      }
      const place = locations.find((l) => l.id === editPlace);
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id
            ? {
                ...r,
                startTime: editStart,
                endTime: editEnd,
                slotDurationMinutes: editDuration,
                ...(place ? { locationId: place.id, locationName: place.name, locationColor: place.color } : {}),
              }
            : r
        )
      );
      setEditingId(null);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(rule: Rule) {
    setBusyId(rule.id);
    setError(null);
    try {
      const res = await fetch(`/api/availability-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: rule.startTime,
          endTime: rule.endTime,
          slotDurationMinutes: rule.slotDurationMinutes,
          isActive: !rule.isActive,
        }),
      });
      if (!res.ok) {
        setError(r.toggleError);
        return;
      }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(rule: Rule, removeFutureOpenSlots: boolean) {
    setBusyId(rule.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/availability-rules/${rule.id}?removeFutureOpenSlots=${removeFutureOpenSlots}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError(r.deleteError);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      setConfirmingDeleteId(null);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusyId(null);
    }
  }

  function toggleAddingDay(day: number) {
    setAddingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function submitAdd() {
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/availability-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: addingDays,
          startTime: addStart,
          endTime: addEnd,
          slotDurationMinutes: addDuration,
          locationId: manyPlaces ? addPlace : undefined,
        }),
      });
      if (!res.ok) {
        setError(r.addError);
        return;
      }
      // Simplest correct refresh: the server response doesn't echo the new
      // rule ids, and we need up-to-date future-slot counts anyway.
      window.location.reload();
    } catch {
      setError(m.common.networkError);
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{r.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{r.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-md border px-3 py-2 text-sm">
                {editingId === rule.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`start-${rule.id}`}>{m.availability.from}</Label>
                        <Input
                          id={`start-${rule.id}`}
                          type="time"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`end-${rule.id}`}>{m.availability.to}</Label>
                        <Input
                          id={`end-${rule.id}`}
                          type="time"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`duration-${rule.id}`}>{r.duration}</Label>
                        <Select
                          value={String(editDuration)}
                          onValueChange={(v) => setEditDuration(Number(v))}
                        >
                          <SelectTrigger id={`duration-${rule.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DURATION_OPTIONS.map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {m.common.minutes(d)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <LocationSelect id={`place-${rule.id}`} locations={locations} value={editPlace} onChange={setEditPlace} label={m.locations.where} />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === rule.id}
                        onClick={() => saveEdit(rule)}
                      >
                        {r.save}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        {m.common.cancel}
                      </Button>
                    </div>
                  </div>
                ) : confirmingDeleteId === rule.id ? (
                  <div className="flex flex-col gap-2">
                    <p>
                      {r.deleteQuestion(rule.futureOpenCount, rule.futureBookedCount)}
                      <strong>{r.neverDeleted}</strong>
                      {r.deleteQuestionEnd}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === rule.id}
                        onClick={() => confirmDelete(rule, true)}
                      >
                        {r.deleteWithSlots}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => confirmDelete(rule, false)}
                      >
                        {r.deleteRuleOnly}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        {m.common.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
                    <span className={cn(!rule.isActive && "text-muted-foreground line-through")}>
                      {manyPlaces && (
                        <span className="me-1.5 inline-flex items-center gap-1">
                          <LocationDot color={rule.locationColor} />
                          {rule.locationName} ·
                        </span>
                      )}
                      {r.summary(m.labels.days[rule.dayOfWeek], rule.startTime, rule.endTime, m.common.minutes(rule.slotDurationMinutes))}
                      {(rule.futureOpenCount > 0 || rule.futureBookedCount > 0) && (
                        <span className="text-muted-foreground">
                          {" "}
                          {r.counts(rule.futureOpenCount, rule.futureBookedCount)}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => startEdit(rule)}
                      >
                        {r.edit}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => toggleActive(rule)}
                      >
                        {rule.isActive ? r.disable : r.enable}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => setConfirmingDeleteId(rule.id)}
                      >
                        {r.delete}
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">{r.addTitle}</p>
          <div className="flex flex-wrap justify-center gap-2 md:justify-start">
            {m.labels.days.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleAddingDay(day)}
                className={cn(
                  "min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors md:min-h-9",
                  addingDays.includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor="addStart">{m.availability.from}</Label>
              <Input
                id="addStart"
                type="time"
                value={addStart}
                onChange={(e) => setAddStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addEnd">{m.availability.to}</Label>
              <Input
                id="addEnd"
                type="time"
                value={addEnd}
                onChange={(e) => setAddEnd(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addDuration">{r.duration}</Label>
              <Select value={String(addDuration)} onValueChange={(v) => setAddDuration(Number(v))}>
                <SelectTrigger id="addDuration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {m.common.minutes(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LocationSelect id="add-place" locations={locations} value={addPlace} onChange={setAddPlace} label={m.locations.where} />
            <Button
              type="button"
              className="w-full md:w-auto"
              disabled={addingDays.length === 0 || adding}
              onClick={submitAdd}
            >
              {adding ? m.availability.adding : r.addButton}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
