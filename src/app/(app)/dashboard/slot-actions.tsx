"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/time-select";
import { useI18n } from "@/i18n/client";

/** Fired after a slot changed on the server; the calendars listen and reload. */
export const SLOTS_CHANGED_EVENT = "cleana:slots-changed";
const announce = () => window.dispatchEvent(new Event(SLOTS_CHANGED_EVENT));

type ClientOption = { id: string; fullName: string; phone: string | null };

const field = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

/**
 * The therapist books a client into an open slot by hand: one from their list,
 * or somebody new (a name is enough).
 */
export function BookClientForm({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { m, issue } = useI18n();
  const s = m.dashboard.schedule;
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clients, setClients] = useState<ClientOption[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/clients")
      .then((res) => (res.ok ? res.json() : { clients: [] }))
      .then((data: { clients: ClientOption[] }) => {
        if (!alive) return;
        setClients(data.clients);
        if (data.clients.length === 0) setMode("new");
      })
      .catch(() => alive && setClients([]));
    return () => {
      alive = false;
    };
  }, []);

  const ready = mode === "existing" ? clientId !== "" : fullName.trim().length >= 2;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/book`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "existing" ? { clientId } : { fullName, phone, email }),
      });
      if (res.ok) {
        announce();
        onDone();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(
        res.status === 409
          ? s.slotTaken
          : data?.error === "invalid"
            ? issue(data.issues?.[0]?.message)
            : s.bookError
      );
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted inline-flex gap-1 rounded-md p-1 text-xs">
        {(["existing", "new"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`min-h-8 flex-1 rounded-sm px-2 font-medium ${mode === k ? "bg-card shadow-xs" : "text-muted-foreground"}`}
          >
            {k === "existing" ? s.existingClient : s.newClient}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        clients === null ? (
          <p className="text-muted-foreground text-xs">{m.common.loading}</p>
        ) : clients.length === 0 ? (
          <p className="text-muted-foreground text-xs">{s.noClients}</p>
        ) : (
          <select className={field} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label={s.pickClient}>
            <option value="">{s.pickClient}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.phone ? `${c.fullName} · ${c.phone}` : c.fullName}
              </option>
            ))}
          </select>
        )
      ) : (
        <>
          <Input className="h-9 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={s.clientName} maxLength={255} />
          <Input className="h-9 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={s.clientPhone} maxLength={50} inputMode="tel" dir="ltr" />
          <Input className="h-9 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={s.clientEmail} maxLength={255} type="email" dir="ltr" />
          <p className="text-muted-foreground text-xs">{s.emailHint}</p>
        </>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" size="sm" className="w-full" disabled={busy || !ready} onClick={submit}>
        {busy ? s.booking : s.bookNow}
      </Button>
    </div>
  );
}

/** Changes when an empty slot takes place: the day, from and to, on the half hour. */
export function MoveSlotForm({
  sessionId,
  date,
  start,
  end,
  onDone,
}: {
  sessionId: string;
  date: string;
  start: string;
  end: string;
  onDone: () => void;
}) {
  const { m } = useI18n();
  const s = m.dashboard.schedule;
  const [day, setDay] = useState(date);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: day, startTime: from, endTime: to }),
      });
      if (res.ok) {
        announce();
        onDone();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(
        data?.error === "overlaps_existing"
          ? s.overlaps
          : data?.error === "in_past"
            ? s.inPast
            : data?.error === "from_cleana"
              ? s.fromCleanaHint
              : s.saveError
      );
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{s.date}</Label>
        <Input type="date" className="h-9 text-sm" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{s.from}</Label>
          <TimeSelect className="h-9" value={from} onChange={setFrom} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{s.to}</Label>
          <TimeSelect className="h-9" value={to} min={from} onChange={setTo} />
        </div>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" size="sm" className="w-full" disabled={busy || !day || to <= from} onClick={submit}>
        {busy ? s.saving : s.saveTime}
      </Button>
    </div>
  );
}
