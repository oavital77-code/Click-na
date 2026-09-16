"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookingLinkPrefix } from "@/lib/public-url";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DURATION_OPTIONS,
  LOCATION_TYPES,
  PROFESSION_TYPES,
  type OnboardingInput,
} from "@/lib/onboarding-schema";
import { useI18n } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { profileSchema, settingsSchema } from "@/lib/settings-schema";
import { ResetSchedule } from "@/components/reset-schedule";

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
  /** Null is "no online payment" — a real choice, kept apart from 0. */
  sessionPriceIls: number | null;
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-center gap-2 text-sm md:min-h-0 md:justify-start">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 md:size-4"
      />
      {label}
    </label>
  );
}

function isSlugCooldownActive(slugChangedAt: string | null) {
  if (!slugChangedAt) return false;
  return Date.now() - new Date(slugChangedAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

export function SettingsView({
  profile: initialProfile,
  settings: initialSettings,
}: {
  profile: ProfileState;
  settings: SettingsState;
}) {
  const router = useRouter();
  const { m, issue } = useI18n();
  const [profile, setProfile] = useState(initialProfile);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [settings, setSettings] = useState(initialSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  function updateSettings<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const slugCooldownActive = isSlugCooldownActive(profile.slugChangedAt);

  async function saveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      setProfileError(issue(parsed.error.issues[0]?.message));
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(
          data.error === "slug_taken"
            ? m.settings.slugTaken
            : data.error === "SLUG_CHANGE_TOO_SOON"
              ? m.settings.slugTooSoon
              : m.common.genericError
        );
        return;
      }
      setProfile((prev) => ({ ...prev, slugChangedAt: data.therapist.slugChangedAt }));
      setProfileSaved(true);
      // The language lives in the profile; the server components around this
      // form (nav, header) only pick the change up on a fresh render.
      router.refresh();
    } catch {
      setProfileError(m.common.networkError);
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveSettings() {
    setSettingsError(null);
    setSettingsSaved(false);
    const parsed = settingsSchema.safeParse(settings);
    if (!parsed.success) {
      setSettingsError(issue(parsed.error.issues[0]?.message));
      return;
    }
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setSettingsError(m.common.genericError);
        return;
      }
      setSettingsSaved(true);
    } catch {
      setSettingsError(m.common.networkError);
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    if (!profileSaved) return;
    const t = setTimeout(() => setProfileSaved(false), 3000);
    return () => clearTimeout(t);
  }, [profileSaved]);

  useEffect(() => {
    if (!settingsSaved) return;
    const t = setTimeout(() => setSettingsSaved(false), 3000);
    return () => clearTimeout(t);
  }, [settingsSaved]);

  return (
    <div className="flex flex-col gap-6">
      {/* Profile and public link */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.profileCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">{m.settings.fullName}</Label>
            <Input
              id="fullName"
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">{m.settings.phone}</Label>
            <Input
              id="phone"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="professionType">{m.settings.profession}</Label>
            <Select
              value={profile.professionType ?? ""}
              onValueChange={(v) =>
                setProfile((p) => ({ ...p, professionType: v as ProfileState["professionType"] }))
              }
            >
              <SelectTrigger id="professionType">
                <SelectValue placeholder={m.settings.pickProfession} />
              </SelectTrigger>
              <SelectContent>
                {PROFESSION_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {m.labels.profession[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="locale">{m.settings.language}</Label>
            <Select
              value={profile.locale}
              onValueChange={(v) => setProfile((p) => ({ ...p, locale: v as Locale }))}
            >
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {m.labels.language[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{m.settings.languageHelp}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">{m.settings.yourAddress}</Label>
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span>{bookingLinkPrefix()}</span>
              <Input
                id="slug"
                dir="ltr"
                className="w-auto flex-1 text-start"
                value={profile.slug}
                disabled={slugCooldownActive}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, slug: e.target.value.toLowerCase() }))
                }
              />
            </div>
            {slugCooldownActive && (
              <p className="text-muted-foreground text-xs">{m.settings.slugCooldown}</p>
            )}
          </div>
          {profileError && <p className="text-destructive text-sm">{profileError}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" disabled={profileSaving} onClick={saveProfile} className="w-fit">
              {profileSaving ? m.common.saving : m.settings.saveProfile}
            </Button>
            {profileSaved && <span className="text-sm text-green-600">{m.common.saved}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Session times */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.timesCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="duration">{m.settings.defaultDuration}</Label>
            <Select
              value={String(settings.defaultDurationMinutes)}
              onValueChange={(v) => updateSettings("defaultDurationMinutes", Number(v))}
            >
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {m.common.minutes(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessionPrice">{m.settings.sessionPrice}</Label>
            <Input
              id="sessionPrice"
              type="number"
              inputMode="decimal"
              min={1}
              step={0.01}
              dir="ltr"
              value={settings.sessionPriceIls ?? ""}
              onChange={(e) =>
                updateSettings("sessionPriceIls", e.target.value === "" ? null : Number(e.target.value))
              }
            />
            <p className="text-muted-foreground text-xs">{m.settings.sessionPriceHelp}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bufferBefore">{m.settings.bufferBefore}</Label>
              <Input
                id="bufferBefore"
                type="number"
                min={0}
                value={settings.bufferBeforeMinutes}
                onChange={(e) => updateSettings("bufferBeforeMinutes", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bufferAfter">{m.settings.bufferAfter}</Label>
              <Input
                id="bufferAfter"
                type="number"
                min={0}
                value={settings.bufferAfterMinutes}
                onChange={(e) => updateSettings("bufferAfterMinutes", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="minNotice">{m.settings.minNotice}</Label>
              <Input
                id="minNotice"
                type="number"
                min={0}
                value={settings.minNoticeHours}
                onChange={(e) => updateSettings("minNoticeHours", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxAdvance">{m.settings.maxAdvance}</Label>
              <Input
                id="maxAdvance"
                type="number"
                min={1}
                value={settings.maxAdvanceDays}
                onChange={(e) => updateSettings("maxAdvanceDays", Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.locationCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationType">{m.settings.locationType}</Label>
            <Select
              value={settings.locationType}
              onValueChange={(v) => updateSettings("locationType", v as SettingsState["locationType"])}
            >
              <SelectTrigger id="locationType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_TYPES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {m.labels.location[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(settings.locationType === "clinic" ||
            settings.locationType === "client_home" ||
            settings.locationType === "hybrid") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="locationAddress">{m.settings.address}</Label>
              <Input
                id="locationAddress"
                value={settings.locationAddress}
                onChange={(e) => updateSettings("locationAddress", e.target.value)}
              />
            </div>
          )}
          {(settings.locationType === "online" || settings.locationType === "hybrid") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="onlineMeetingUrl">{m.settings.meetingUrl}</Label>
              <Input
                id="onlineMeetingUrl"
                dir="ltr"
                value={settings.onlineMeetingUrl}
                onChange={(e) => updateSettings("onlineMeetingUrl", e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationNotes">{m.settings.locationNotes}</Label>
            <Input
              id="locationNotes"
              value={settings.locationNotes}
              onChange={(e) => updateSettings("locationNotes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cancellation and booking policy */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.policyCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellationHours">{m.settings.cancellationHours}</Label>
            <Input
              id="cancellationHours"
              type="number"
              min={0}
              value={settings.cancellationPolicyHours}
              onChange={(e) => updateSettings("cancellationPolicyHours", Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellationText">{m.settings.cancellationText}</Label>
            <Input
              id="cancellationText"
              value={settings.cancellationPolicyText}
              onChange={(e) => updateSettings("cancellationPolicyText", e.target.value)}
            />
          </div>
          <ToggleRow
            label={m.settings.requirePhone}
            checked={settings.requirePhone}
            onChange={(v) => updateSettings("requirePhone", v)}
          />
          <ToggleRow
            label={m.settings.autoConfirm}
            checked={settings.autoConfirm}
            onChange={(v) => updateSettings("autoConfirm", v)}
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.notificationsCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            label={m.settings.emailConfirmation}
            checked={settings.sendEmailConfirmation}
            onChange={(v) => updateSettings("sendEmailConfirmation", v)}
          />
          <ToggleRow
            label={m.settings.emailReminder}
            checked={settings.sendEmailReminder}
            onChange={(v) => updateSettings("sendEmailReminder", v)}
          />
          <ToggleRow
            label={m.settings.whatsappReminder}
            checked={settings.sendSmsReminder}
            onChange={(v) => updateSettings("sendSmsReminder", v)}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="reminderHours">{m.settings.reminderHours}</Label>
            <Input
              id="reminderHours"
              type="number"
              min={0}
              value={settings.reminderHoursBefore}
              onChange={(e) => updateSettings("reminderHoursBefore", Number(e.target.value))}
            />
          </div>
          <p className="text-muted-foreground text-xs">{m.settings.notificationsNote}</p>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.brandingCard}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookingPageHeadline">{m.settings.bookingHeadline}</Label>
            <Input
              id="bookingPageHeadline"
              value={settings.bookingPageHeadline}
              onChange={(e) => updateSettings("bookingPageHeadline", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookingPageDescription">{m.settings.bookingDescription}</Label>
            <Input
              id="bookingPageDescription"
              value={settings.bookingPageDescription}
              onChange={(e) => updateSettings("bookingPageDescription", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brandColor">{m.settings.brandColor}</Label>
            <Input
              id="brandColor"
              type="color"
              className="h-10 w-16 p-1"
              value={settings.brandColor || "#000000"}
              onChange={(e) => updateSettings("brandColor", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brandLogoUrl">{m.settings.brandLogoUrl}</Label>
            <Input
              id="brandLogoUrl"
              dir="ltr"
              value={settings.brandLogoUrl}
              onChange={(e) => updateSettings("brandLogoUrl", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 md:justify-start">
        {settingsError && <p className="text-destructive text-sm">{settingsError}</p>}
      </div>
      <div className="flex flex-col items-center gap-2 md:flex-row md:justify-start">
        <Button type="button" disabled={settingsSaving} onClick={saveSettings} className="w-full md:w-fit">
          {settingsSaving ? m.common.saving : m.settings.saveSettings}
        </Button>
        {settingsSaved && <span className="text-sm text-green-600">{m.common.saved}</span>}
      </div>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.privacyCard}</CardTitle>
          <CardDescription>{m.settings.privacyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="outline" className="w-full md:w-fit">
            <a href="/api/me/export">{m.settings.exportData}</a>
          </Button>
          <p className="text-muted-foreground text-xs">{m.settings.accountNote}</p>
        </CardContent>
      </Card>

      {/* Reset */}
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.resetCard}</CardTitle>
          <CardDescription>{m.settings.resetDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetSchedule scope="everything" />
        </CardContent>
      </Card>
    </div>
  );
}
