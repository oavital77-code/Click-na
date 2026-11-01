"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";

/** Longest side the logo is stored at — sharp on a booking page, small to serve. */
const MAX_SIDE = 640;

/**
 * Shrinks a picture in the browser before it is sent: a phone photo is many
 * megabytes, the logo slot is a few hundred pixels. WebP keeps transparency;
 * a browser that cannot write WebP returns PNG, which the server takes too.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/webp", 0.9)
  );
}

/**
 * The booking page's logo: upload a picture (the usual way) or paste a link.
 * An upload is saved at once and its address handed back through onChange,
 * so the surrounding form's own save keeps it.
 */
export function LogoField({ id, value, onChange }: { id: string; value: string; onChange: (url: string) => void }) {
  const { m } = useI18n();
  const t = m.settings.logoUpload;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      let blob: Blob = file;
      try {
        blob = await shrink(file);
      } catch {
        // Not something the browser can decode: let the server judge the original.
      }
      const body = new FormData();
      body.append("file", blob, "logo");
      const res = await fetch("/api/me/logo", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: keyof typeof t.errors };
      if (!res.ok || !data.url) {
        setError(t.errors[data.error ?? "failed"] ?? t.errors.failed);
        return;
      }
      onChange(data.url);
    } catch {
      setError(t.errors.failed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/me/logo", { method: "DELETE" });
      onChange("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-start">
      <Label htmlFor={id}>{m.settings.brandLogoUrl}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- any host the therapist pastes, so not next/image
          <img src={value} alt={t.preview} className="border-border bg-background size-16 rounded-2xl border object-contain p-1" />
        ) : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp className="size-4" />
          {busy ? t.uploading : value ? t.replace : t.upload}
        </Button>
        {value && (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="size-4" />
            {t.remove}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{t.hint}</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-url`} className="text-muted-foreground text-xs font-normal">
          {t.orLink}
        </Label>
        <Input
          id={`${id}-url`}
          dir="ltr"
          className="text-start"
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
