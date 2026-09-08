"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookingLinkPrefix } from "@/lib/public-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingInput } from "@/lib/onboarding-schema";
import { profileSchema, settingsSchema } from "@/lib/settings-schema";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";

type ProfileState = {
  fullName: string;
  phone: string;
  professionType: OnboardingInput["professionType"] | null;
  locale: Locale;
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
  const { m, issue } = useI18n();
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
      setError(issue(profileParsed.error.issues[0]?.message));
      return;
    }
    const settingsParsed = settingsSchema.safeParse(settings);
    if (!settingsParsed.success) {
      setError(issue(settingsParsed.error.issues[0]?.message));
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
            ? m.settings.slugTaken
            : profileData.error === "SLUG_CHANGE_TOO_SOON"
              ? m.settings.slugTooSoon
              : m.link.saveAddressError
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
        setError(m.link.saveContentError);
        return;
      }

      setSavedSlug(profile.slug);
      setPreviewVersion((v) => v + 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(m.common.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Preview — always reflects the last saved state. */}
      <div className="flex min-h-[50vh] flex-1 flex-col gap-3 p-4 text-center md:min-h-0 md:p-8 md:text-start">
        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
          <h1 className="text-xl">{m.link.preview}</h1>
          <a
            href={`/book/${savedSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex min-h-11 items-center text-sm underline underline-offset-2 md:min-h-0"
          >
            {m.link.openNewTab}
          </a>
        </div>
        <div className="border-border bg-card flex-1 overflow-hidden rounded-lg border">
          <iframe
            key={previewVersion}
            src={`/book/${savedSlug}`}
            title={m.link.previewTitle}
            className="h-full min-h-[500px] w-full border-0"
          />
        </div>
      </div>

      {/* Options panel — opposite side from the main nav. */}
      <aside className="border-border bg-card flex w-full flex-col gap-4 border-t p-4 text-center md:w-80 md:shrink-0 md:border-t-0 md:border-s md:p-6 md:text-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.link.yourLink}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="slug">{m.settings.yourAddress}</Label>
            <div className="text-muted-foreground flex items-center justify-center gap-1 text-sm md:justify-start">
              <span className="num">{bookingLinkPrefix()}</span>
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
              <p className="text-muted-foreground text-xs">{m.settings.slugCooldown}</p>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-1 md:justify-start">
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                {copied ? m.link.copied : m.link.copyLink}
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(m.link.shareText(publicUrl))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.link.shareWhatsapp}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.link.pageContent}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bookingPageHeadline">{m.settings.bookingHeadline}</Label>
              <Input
                id="bookingPageHeadline"
                value={settings.bookingPageHeadline}
                onChange={(e) => setSettings((s) => ({ ...s, bookingPageHeadline: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bookingPageDescription">{m.settings.bookingDescription}</Label>
              <Input
                id="bookingPageDescription"
                value={settings.bookingPageDescription}
                onChange={(e) => setSettings((s) => ({ ...s, bookingPageDescription: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.settings.brandingCard}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="brandColor">{m.settings.brandColor}</Label>
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <Input
                  id="brandColor"
                  type="color"
                  className="h-10 w-16 p-1"
                  value={settings.brandColor || "#000000"}
                  onChange={(e) => setSettings((s) => ({ ...s, brandColor: e.target.value }))}
                />
                <span className="text-muted-foreground num text-sm">{settings.brandColor || m.link.defaultColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="brandLogoUrl">{m.settings.brandLogoUrl}</Label>
              <Input
                id="brandLogoUrl"
                dir="ltr"
                className="text-start"
                placeholder="https://..."
                value={settings.brandLogoUrl}
                onChange={(e) => setSettings((s) => ({ ...s, brandLogoUrl: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="button" disabled={saving} onClick={handleSave} className="w-full">
            {saving ? m.common.saving : m.link.saveAndPreview}
          </Button>
        </div>
        {saved && <span className="text-center text-sm text-green-600">{m.common.saved}</span>}
      </aside>
    </div>
  );
}
