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
import { DAY_LABELS } from "@/lib/labels";
import { DURATION_OPTIONS } from "@/lib/onboarding-schema";

type Rule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  futureOpenCount: number;
  futureBookedCount: number;
};

export function RecurringRules({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("17:00");
  const [editDuration, setEditDuration] = useState(50);

  const [addingDays, setAddingDays] = useState<number[]>([]);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("17:00");
  const [addDuration, setAddDuration] = useState(50);
  const [adding, setAdding] = useState(false);

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditStart(rule.startTime);
    setEditEnd(rule.endTime);
    setEditDuration(rule.slotDurationMinutes);
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
        }),
      });
      if (!res.ok) {
        setError("אירעה שגיאה בשמירה");
        return;
      }
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id
            ? { ...r, startTime: editStart, endTime: editEnd, slotDurationMinutes: editDuration }
            : r
        )
      );
      setEditingId(null);
    } catch {
      setError("שגיאת רשת, נסה שוב");
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
        setError("אירעה שגיאה");
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
        setError("אירעה שגיאה במחיקה");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      setConfirmingDeleteId(null);
    } catch {
      setError("שגיאת רשת, נסה שוב");
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
        }),
      });
      if (!res.ok) {
        setError("אירעה שגיאה בהוספת הכלל");
        return;
      }
      // Simplest correct refresh: the server response doesn't echo the new
      // rule ids, and we need up-to-date future-slot counts anyway.
      window.location.reload();
    } catch {
      setError("שגיאת רשת, נסה שוב");
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>כללי זמינות חוזרים</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין כללי זמינות חוזרים</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-md border px-3 py-2 text-sm">
                {editingId === rule.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`start-${rule.id}`}>משעה</Label>
                        <Input
                          id={`start-${rule.id}`}
                          type="time"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`end-${rule.id}`}>עד שעה</Label>
                        <Input
                          id={`end-${rule.id}`}
                          type="time"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`duration-${rule.id}`}>משך</Label>
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
                                {d} דקות
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === rule.id}
                        onClick={() => saveEdit(rule)}
                      >
                        שמור
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        ביטול
                      </Button>
                    </div>
                  </div>
                ) : confirmingDeleteId === rule.id ? (
                  <div className="flex flex-col gap-2">
                    <p>
                      לכלל הזה יש {rule.futureOpenCount} חלונות פתוחים ו-{rule.futureBookedCount}{" "}
                      חלונות מוזמנים בעתיד. ההזמנות הקיימות{" "}
                      <strong>לעולם לא יימחקו</strong>. למחוק גם את החלונות הפתוחים?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === rule.id}
                        onClick={() => confirmDelete(rule, true)}
                      >
                        מחק את הכלל וגם את החלונות הפתוחים
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => confirmDelete(rule, false)}
                      >
                        מחק רק את הכלל
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        ביטול
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(!rule.isActive && "text-muted-foreground line-through")}>
                      {DAY_LABELS[rule.dayOfWeek]} · {rule.startTime}–{rule.endTime} ·{" "}
                      {rule.slotDurationMinutes} דקות
                      {(rule.futureOpenCount > 0 || rule.futureBookedCount > 0) && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({rule.futureOpenCount} פנויים, {rule.futureBookedCount} מוזמנים)
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => startEdit(rule)}
                      >
                        ערוך
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => toggleActive(rule)}
                      >
                        {rule.isActive ? "השבת" : "הפעל"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === rule.id}
                        onClick={() => setConfirmingDeleteId(rule.id)}
                      >
                        מחק
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">הוסף כלל חדש</p>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleAddingDay(day)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  addingDays.includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="addStart">משעה</Label>
              <Input
                id="addStart"
                type="time"
                value={addStart}
                onChange={(e) => setAddStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addEnd">עד שעה</Label>
              <Input
                id="addEnd"
                type="time"
                value={addEnd}
                onChange={(e) => setAddEnd(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addDuration">משך</Label>
              <Select value={String(addDuration)} onValueChange={(v) => setAddDuration(Number(v))}>
                <SelectTrigger id="addDuration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} דקות
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={addingDays.length === 0 || adding}
              onClick={submitAdd}
            >
              {adding ? "מוסיף..." : "+ הוסף כלל"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
