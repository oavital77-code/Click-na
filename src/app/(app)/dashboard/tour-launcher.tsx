"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { GuidedTour } from "@/components/guided-tour";
import { useI18n } from "@/i18n/client";
import { tourSteps, type TourStepDef } from "@/lib/tour-steps";

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });

/** The phone's drawer lives in DashboardNav; the tour asks it to open and close. */
function setMenu(open: boolean) {
  window.dispatchEvent(new CustomEvent("cleana:menu", { detail: open ? "open" : "close" }));
}

/**
 * Starts the guided tour: on its own for an account that has not had it
 * (`autoStart`), or when asked — the button below, or ?tour=1 from Settings.
 * Whichever way it ends, the account remembers it was shown.
 */
export function TourLauncher({
  autoStart,
  requested,
  hasFirstSteps,
}: {
  autoStart: boolean;
  /** Came with ?tour=1: someone asked for it. */
  requested: boolean;
  hasFirstSteps: boolean;
}) {
  const { m } = useI18n();
  const [steps, setSteps] = useState<TourStepDef[] | null>(null);

  const start = useCallback(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    window.scrollTo({ top: 0 });
    setSteps(tourSteps({ mobile, firstSteps: hasFirstSteps }));
  }, [hasFirstSteps]);

  useEffect(() => {
    if (!autoStart && !requested) return;
    // Let the page settle first: fonts, the first paint, the calendar.
    const timer = setTimeout(start, 700);
    if (requested) window.history.replaceState(null, "", window.location.pathname);
    return () => clearTimeout(timer);
  }, [autoStart, requested, start]);

  const close = useCallback(() => {
    setMenu(false);
    setSteps(null);
    window.scrollTo({ top: 0 });
    void fetch("/api/me/tour", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  const beforeStep = useCallback(async (step: TourStepDef) => {
    setMenu(!!step.menu);
    await frames(2);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="text-primary-strong hover:text-foreground inline-flex min-h-8 w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        <Compass className="size-4" aria-hidden />
        {m.tour.button}
      </button>
      {steps && <GuidedTour steps={steps} beforeStep={beforeStep} onClose={close} />}
    </>
  );
}
