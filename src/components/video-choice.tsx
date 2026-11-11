"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { ONBOARDING_VIDEO_CHOICES } from "@/lib/video-schema";

export type VideoChoice = (typeof ONBOARDING_VIDEO_CHOICES)[number];

/**
 * "How will you hold sessions online?" — asked where a place is made online.
 * Only the way is chosen here; the link itself is connected in Add-ons, where
 * each way has its own instructions.
 */
export function VideoChoicePicker({ value, onChange }: { value: VideoChoice | null; onChange: (v: VideoChoice) => void }) {
  const { m } = useI18n();
  const t = m.videoChoice;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{t.question}</legend>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t.question}>
        {ONBOARDING_VIDEO_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={value === choice}
            onClick={() => onChange(choice)}
            className={cn(
              "flex min-h-11 flex-col items-start gap-0.5 rounded-2xl border p-3 text-start transition-colors",
              value === choice ? "border-primary bg-primary/10 ring-primary ring-1" : "border-border hover:bg-secondary"
            )}
          >
            <span className="text-sm font-bold">{t.choices[choice]}</span>
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t.after}</p>
    </fieldset>
  );
}
