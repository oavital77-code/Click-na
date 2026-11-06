"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { placeCard, type Box } from "@/lib/tour-position";
import type { TourStepDef } from "@/lib/tour-steps";

/** Room around the lit-up element, so its edge is not cut by the spotlight. */
const PAD = 6;

/** The first element with this `data-tour` that is actually on screen (phone and desktop each have their own). */
function findTarget(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });

/**
 * A guided tour: the page dims, one element at a time is lit up, and a card
 * beside it says what it does. Built here rather than pulled in as a library:
 * it is one screen of code, it speaks both directions of text, and it has to
 * find the phone's and the desktop's copy of the same menu item.
 *
 * `beforeStep` runs before each step is looked for — the phone's drawer is
 * opened there. A step whose element is not on screen is skipped.
 */
export function GuidedTour({
  steps: initialSteps,
  beforeStep,
  onClose,
}: {
  steps: TourStepDef[];
  beforeStep?: (step: TourStepDef) => Promise<void> | void;
  onClose: (how: "done" | "skipped") => void;
}) {
  const { m, dir } = useI18n();
  const t = m.tour;
  // The steps that really run: one whose element is not on screen is dropped, so "step 5 of 17" stays true.
  const [steps, setSteps] = useState(initialSteps);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const opener = useRef<Element | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    const el = elementRef.current;
    if (!el) {
      setTarget(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTarget({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, []);

  const finish = useCallback(
    (how: "done" | "skipped") => {
      onClose(how);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    },
    [onClose]
  );

  const go = useCallback(
    (by: 1 | -1) => {
      direction.current = by;
      if (by === 1 && index === steps.length - 1) return finish("done");
      setReady(false); // the card hides until the next element is found
      setIndex((i) => Math.min(Math.max(i + by, 0), steps.length - 1));
    },
    [index, steps.length, finish]
  );

  // Find and light up this step's element.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await beforeStep?.(step);
      await frames(2);
      if (cancelled) return;
      if (step.target) {
        const el = findTarget(step.target);
        if (!el) {
          // Not on this screen: drop it and carry on in the direction the person was going.
          const wasLast = index === steps.length - 1;
          setSteps((list) => list.filter((_, i) => i !== index));
          if (direction.current === 1) {
            if (wasLast) finish("done");
          } else {
            setIndex((i) => Math.max(i - 1, 0));
          }
          return;
        }
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
        el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest" });
        await frames(2);
        if (cancelled) return;
        elementRef.current = el;
      } else {
        elementRef.current = null;
      }
      measure();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Once per step (by its id, since dropping a step moves the next one into the same index);
    // beforeStep/finish are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // Keep the spotlight on its element through scrolling and resizing.
  useEffect(() => {
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [measure]);

  // Place the card once we know both the element and the card's own size.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !ready) return;
    const placed = placeCard(
      step.target ? target : null,
      { width: card.offsetWidth, height: card.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      step.target?.startsWith("nav-") ? "side" : "auto"
    );
    setPos({ top: placed.top, left: placed.left });
  }, [target, ready, step]);

  // Focus moves to the card on every step, so a screen reader announces it.
  useEffect(() => {
    if (!opener.current) opener.current = document.activeElement;
  }, []);
  useEffect(() => {
    if (ready) cardRef.current?.focus({ preventScroll: true });
  }, [ready, index]);

  // Keyboard: Esc skips; the arrow that points "forward" for the text direction moves on.
  useEffect(() => {
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish("skipped");
      } else if (e.key === forward) {
        e.preventDefault();
        go(1);
      } else if (e.key === back && index > 0) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Tab") {
        // Keep Tab inside the card: the page behind is dimmed and not for use.
        const items = cardRef.current?.querySelectorAll<HTMLElement>("button");
        if (!items || items.length === 0) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && active === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dir, go, index, finish]);

  if (typeof document === "undefined" || !step) return null;

  const text = t.steps[step.id];
  const titleId = "tour-title";
  const bodyId = "tour-body";

  return createPortal(
    <div className="fixed inset-0 z-[100]" dir={dir}>
      {/* Blocks the page behind: the tour explains, it is not for clicking through. */}
      <div className={ready && target && step.target ? "absolute inset-0" : "absolute inset-0 bg-black/60"} />
      {ready && target && step.target && (
        <div
          aria-hidden
          className="ring-primary pointer-events-none fixed rounded-2xl ring-2 motion-safe:transition-all motion-safe:duration-200"
          style={{
            top: target.top,
            left: target.left,
            width: target.width,
            height: target.height,
            boxShadow: "0 0 0 9999px rgba(20, 14, 8, 0.62)",
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="bg-card text-card-foreground border-border fixed flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3 rounded-2xl border p-5 text-start shadow-2xl outline-none"
        style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: ready && pos ? "visible" : "hidden" }}
      >
        <div className="flex items-center gap-3">
          <div className="bg-secondary h-1 flex-1 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
          <span className="text-muted-foreground num text-xs whitespace-nowrap">{t.progress(index + 1, steps.length)}</span>
        </div>
        <h2 id={titleId} className="text-lg leading-tight font-bold">
          {text.title}
        </h2>
        <p id={bodyId} className="text-muted-foreground text-sm leading-relaxed">
          {text.body}
        </p>
        <div className="flex items-center gap-2 pt-1">
          {index > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => go(-1)}>
              {t.prev}
            </Button>
          )}
          <Button type="button" size="sm" className="flex-1" onClick={() => go(1)}>
            {last ? t.done : index === 0 ? t.start : t.next}
          </Button>
        </div>
        {!last && (
          <button
            type="button"
            onClick={() => finish("skipped")}
            className="text-muted-foreground hover:text-foreground self-center text-xs underline underline-offset-4"
          >
            {t.skip}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
