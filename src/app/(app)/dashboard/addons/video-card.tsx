"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MeetingUrlField } from "@/components/meeting-url-field";
import { statusBadgeClass } from "@/lib/status-badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { LINK_METHODS, VIDEO_METHODS, type VideoMethod, type VideoStatus } from "@/lib/video-schema";

/**
 * How online sessions are held — one way for the whole practice, chosen here:
 * a standing Google Meet room, a standing Zoom room, a Zoom meeting opened per
 * booking, or any other room link. Every online and clinic-and-online place
 * uses it, and every client booking there gets it with the confirmation and
 * the reminder.
 */
export function VideoCard({
  initial,
  onlinePlaces,
  preselect,
  zoomCard,
}: {
  initial: VideoStatus;
  /** Names of the online and clinic-and-online places. */
  onlinePlaces: string[];
  /** Arriving from onboarding or the dashboard with a way already in mind. */
  preselect: VideoMethod | null;
  /** The Zoom connection (account codes), shown when a meeting per booking is chosen. */
  zoomCard: ReactNode;
}) {
  const { m } = useI18n();
  const t = m.addons.video;
  const [status, setStatus] = useState(initial);
  const [method, setMethod] = useState<VideoMethod | null>(preselect ?? initial.method);
  const [link, setLink] = useState(initial.method === (preselect ?? initial.method) ? (initial.link ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Arriving with a way in mind: the card is what they came for.
  useEffect(() => {
    if (preselect) document.getElementById("video")?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLinkMethod = method !== null && LINK_METHODS.includes(method);
  const unchanged = method === status.method && (!isLinkMethod || link.trim() === (status.link ?? ""));

  function choose(next: VideoMethod) {
    setMethod(next);
    setError(null);
    setSaved(false);
    // Each room has its own link: switching from Meet to Zoom starts the field empty.
    setLink(next === status.method ? (status.link ?? "") : "");
  }

  async function save() {
    if (!method) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/me/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, link: isLinkMethod ? link : "" }),
      });
      const data = (await res.json().catch(() => null)) as { video?: VideoStatus; error?: string } | null;
      if (!res.ok || !data?.video) {
        setError(data?.error ?? m.common.genericError);
        return;
      }
      setStatus(data.video);
      setLink(data.video.link ?? "");
      setSaved(true);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="video" className="min-w-0 scroll-mt-20 gap-4 text-center md:text-start">
      <CardHeader className="flex flex-col items-stretch gap-2">
        <CardTitle className="flex items-center justify-center gap-2 text-base md:justify-start">
          <Video className="text-primary size-5" strokeWidth={1.75} />
          {t.title}
        </CardTitle>
        <CardDescription>{t.lead}</CardDescription>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-4">
        {status.ready ? (
          <div className="flex flex-col items-center gap-1 md:items-start">
            <span className={statusBadgeClass("open")}>{t.connected}</span>
            <span className="text-muted-foreground text-xs">
              {status.method ? t.using(t.methods[status.method].name) : t.methods.zoom_auto.name}
              {onlinePlaces.length > 0 && ` · ${t.forPlaces(onlinePlaces.join(", "))}`}
            </span>
          </div>
        ) : status.missing ? (
          <p className="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm" role="alert">
            {t.missing}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{onlinePlaces.length === 0 ? t.noOnlinePlace : t.notYet}</p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t.chooseTitle}</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t.chooseTitle}>
            {VIDEO_METHODS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                onClick={() => choose(value)}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-0.5 rounded-2xl border p-3 text-start transition-colors",
                  method === value ? "border-primary bg-primary/10 ring-primary ring-1" : "border-border hover:bg-secondary"
                )}
              >
                <span className="text-sm font-bold">{t.methods[value].name}</span>
                <span className="text-muted-foreground text-xs">{t.methods[value].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {method && isLinkMethod && (
          <MeetingUrlField
            id="video-link"
            label={t.linkLabel}
            kind={method as "google_meet" | "zoom_link" | "other"}
            value={link}
            onChange={(v) => {
              setLink(v);
              setSaved(false);
            }}
          />
        )}

        {method === "zoom_auto" && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">{t.zoomAutoExplain}</p>
            {zoomCard}
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
        {saved && !error && <p className="text-st-open text-sm font-medium">{t.saved}</p>}

        {method && (
          <Button
            type="button"
            className="self-center md:self-start"
            disabled={busy || unchanged || (isLinkMethod && !link.trim())}
            onClick={save}
          >
            {busy ? m.common.saving : t.save}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
