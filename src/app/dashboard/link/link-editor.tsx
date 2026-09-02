"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingInput } from "@/lib/onboarding-schema";
import { profileSchema, settingsSchema } from "@/lib/settings-schema";

type ProfileState = {
  fullName: string;
  phone: string;
  professionType: OnboardingInput["professionType"] | null;
  slug: string;
  slugChangedAt: string | null;
};

type SettingsState = {
  defaultDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  locationType: OnboardingInput["locationType"];
  locationAddress: string;
  locationNotes: string;
  onlineMeetingUrl: string;
  cancellationPolicyHours: number;
  cancellationPolicyText: string;
  requirePhone: boolean;
  autoConfirm: boolean;
  sendEmailConfirmation: boolean;
  sendEmailReminder: boolean;
  sendSmsReminder: boolean;
  reminderHoursBefore: number;
  brandColor: string;
  brandLogoUrl: string;
  bookingPageHeadline: string;
  bookingPageDescription: string;
};

function isSlugCooldownActive(slugChangedAt: string | null) {
  if (!slugChangedAt) return false;
  return Date.now() - new Date(slugChangedAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

export function LinkEditor({
  profile: initialProfile,
  settings: initialSettings,
}: {
  profile: ProfileState;
  settings: SettingsState;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [settings, setSettings] = useState(initialSettings);
  const [savedSlug, setSavedSlug] = useState(initialProfile.slug);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  const slugCooldownActive = isSlugCooldownActive(profile.slugChangedAt);
  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${savedSlug}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the URL is still visible to copy manually.
    }
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    const profileParsed = profileSchema.safeParse(profile);
    if (!profileParsed.success) {
      setError(profileParsed.error.issues[0]?.message ?? "יש לתקן את הטופס");
      return;
    }
    const settingsParsed = settingsSchema.safeParse(settings);
    if (!settingsParsed.success) {
      setError(settingsParsed.error.issues[0]?.message ?? "יש לתקן את הטופס");
      return;
    }

    setSaving(true);
    try {
      const profileRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileParsed.data),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) {
        setError(
          profileData.error === "slug_taken"
            ? "הכתובת הזו כבר תפוסה"
            : profileData.error === "SLUG_CHANGE_TOO_SOON"
              ? "ניתן לשנות כתובת רק פעם ב-30 יום"
              : "אירעה שגיאה בשמירת הכתובת"
        );
        return;
      }
      setProfile((prev) => ({ ...prev, slugChangedAt: profileData.therapist.slugChangedAt }));

      const settingsRes = await fetch("/api/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsParsed.data),
      });
      if (!settingsRes.ok) {
        setError("אירעה שגיאה בשמירת תוכן העמוד");
        return;
      }

      setSavedSlug(profile.slug);
      setPreviewVersion((v) => v + 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("שגיאת רשת, נסה שוב");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Preview — always reflects the last saved state. */}
      <div className="flex min-h-[50vh] flex-1 flex-col gap-3 p-4 md:min-h-0 md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl">תצוגה מקדימה</h1>
          <a
            href={`/book/${savedSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm underline underline-offset-2"
          >
            פתח בטאב חדש
          </a>
        </div>
        <div className="border-border bg-card flex-1 overflow-hidden rounded-lg border">
          <iframe
            key={previewVersion}
            src={`/book/${savedSlug}`}
            title="תצוגה מקדימה של דף ההזמנה"
            className="h-full min-h-[500px] w-full border-0"
          />
        </div>
      </div>

      {/* Options panel — opposite side from the main nav. */}
      <aside className="border-border bg-card flex w-full flex-col gap-4 border-t p-4 md:w-80 md:shrink-0 md:border-t-0 md:border-s md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">הקישור שלך</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="slug">הכתובת שלך</Label>
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span className="num">cleana.co.il/book/</span>
              <Input
                id="slug"
                dir="ltr"
                className="num w-auto flex-1 text-start"
                value={profile.slug}
                disabled={slugCooldownActive}
                onChange={(e) => setProfile((p) => ({ ...p, slug: e.target.value.toLowerCase() }))}
              />
            </div>
            {slugCooldownActive && (
              <p className="text-muted-foreground text-xs">ניתן לשנות את הכתובת רק פעם ב-30 יום</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                {copied ? "הועתק!" : "העתק קישור"}
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`אפשר לקבוע תור אצלי כאן: ${publicUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  שתף בווטסאפ
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">תוכן העמוד</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bookingPageHeadline">כותרת בדף ההזמנה</Label>
              <Input
                id="bookingPageHeadline"
                value={settings.bookingPageHeadline}
                onChange={(e) => setSettings((s) => ({ ...s, bookingPageHeadline: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bookingPageDescription">תיאור קצר</Label>
              <Input
                id="bookingPageDescription"
                value={settings.bookingPageDescription}
                onChange={(e) => setSettings((s) => ({ ...s, bookingPageDescription: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="button" disabled={saving} onClick={handleSave} className="w-full">
            {saving ? "שומר..." : "שמור ועדכן תצוגה"}
          </Button>
        </div>
        {saved && <span className="text-center text-sm text-green-600">נשמר ✓</span>}
      </aside>
    </div>
  );
}
