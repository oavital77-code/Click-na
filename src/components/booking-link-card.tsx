"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  slug: string;
};

export function BookingLinkCard({ slug }: Props) {
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">הקישור שלך</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="border-input bg-input/20 num truncate rounded-md border px-3 py-2 text-sm" dir="ltr">
          {url || path}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            {copied ? "הועתק!" : "העתק קישור"}
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`אפשר לקבוע תור אצלי כאן: ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              שתף בווטסאפ
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={path} target="_blank" rel="noopener noreferrer">
              צפה בדף
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
