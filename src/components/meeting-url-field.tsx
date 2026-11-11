"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { isGoogleMeetUrl, normalizeMeetingUrl } from "@/lib/meeting-url";

/**
 * The online meeting link, with the way to get one beside it. A therapist who
 * has never made a standing Google Meet room is shown exactly how (three steps,
 * and a button that opens Meet in a new tab); a pasted code or a link without
 * https is completed as they leave the field; a link that works can be tried
 * from here before any client gets it.
 */
export function MeetingUrlField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { m } = useI18n();
  const t = m.meetingLink;
  const [pasteFailed, setPasteFailed] = useState(false);
  const isLink = /^https?:\/\/\S+\.\S+/i.test(value.trim());

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onChange(normalizeMeetingUrl(text));
        setPasteFailed(false);
      }
    } catch {
      // The browser said no (Safari asks, Firefox does not offer it): long-press paste still works.
      setPasteFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          placeholder="meet.google.com/abc-defg-hij"
          value={value}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeMeetingUrl(e.target.value))}
          aria-describedby={`${id}-help`}
          className="flex-1"
        />
        <button
          type="button"
          onClick={paste}
          className="border-border hover:bg-secondary min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium"
        >
          {t.paste}
        </button>
      </div>
      {pasteFailed && <p className="text-muted-foreground text-xs">{t.pasteFailed}</p>}

      {isLink ? (
        <p className="text-muted-foreground text-xs">
          {isGoogleMeetUrl(value) ? t.meetReady : t.linkReady}{" "}
          <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">
            {t.tryIt}
          </a>
        </p>
      ) : (
        <div id={`${id}-help`} className="bg-secondary/60 flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p className="font-medium">{t.howTitle}</p>
          <ol className="text-muted-foreground list-decimal space-y-1 ps-5">
            <li>{t.step1}</li>
            <li>{t.step2}</li>
            <li>{t.step3}</li>
          </ol>
          <a
            href="https://meet.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center justify-center self-start rounded-full px-5 text-sm font-bold"
          >
            {t.openMeet}
          </a>
          <p className="text-muted-foreground text-xs">{t.zoomToo}</p>
        </div>
      )}
    </div>
  );
}
