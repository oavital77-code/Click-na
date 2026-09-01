"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  /** Large, tinted treatment for top-of-dashboard placement. */
  prominent?: boolean;
};

export function BookingLinkCard({ slug, prominent = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [path] = useState(() => `/book/${slug}`);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${path}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the field itself is still selectable.
    }
  }

  return (
    <Card className={cn(prominent && "bg-primary/10 border-primary/20")}>
      <CardHeader>
        <CardTitle className={prominent ? "text-lg" : "text-base"}>הקישור שלי</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          className={cn(
            "border-input bg-card num truncate rounded-md border px-3 text-sm",
            prominent ? "py-3 text-base" : "py-2"
          )}
          dir="ltr"
        >
          {url || path}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={prominent ? "accent" : "outline"}
            size={prominent ? "lg" : "sm"}
            onClick={copyLink}
            className={prominent ? "font-semibold" : undefined}
          >
            {copied ? "הועתק!" : "העתק קישור"}
          </Button>
          <Button type="button" variant="outline" size={prominent ? "lg" : "sm"} asChild>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`אפשר לקבוע תור אצלי כאן: ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              שתף בווטסאפ
            </a>
          </Button>
          <Button type="button" variant="outline" size={prominent ? "lg" : "sm"} asChild>
            <a href={path} target="_blank" rel="noopener noreferrer">
              צפה בדף
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
