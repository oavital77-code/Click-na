"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PROFESSION_LABELS, LOCATION_LABELS } from "@/lib/labels";
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
      setProfileError(parsed.error.issues[0]?.message ?? "יש לתקן את הטופס");
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
            ? "הכתובת הזו כבר תפוסה"
            : data.error === "SLUG_CHANGE_TOO_SOON"
              ? "ניתן לשנות כתובת רק פעם ב-30 יום"
              : "אירעה שגיאה, נסה שוב"
        );
        return;
      }
      setProfile((prev) => ({ ...prev, slugChangedAt: data.therapist.slugChangedAt }));
      setProfileSaved(true);
    } catch {
      setProfileError("שגיאת רשת, נסה שוב");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveSettings() {
    setSettingsError(null);
    setSettingsSaved(false);
    const parsed = settingsSchema.safeParse(settings);
    if (!parsed.success) {
      setSettingsError(parsed.error.issues[0]?.message ?? "יש לתקן את הטופס");
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
        setSettingsError("אירעה שגיאה, נסה שוב");
        return;
      }
      setSettingsSaved(true);
    } catch {
      setSettingsError("שגיאת רשת, נסה שוב");
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
      {/* פרופיל + הקישור שלי */}
      <Card>
        <CardHeader>
          <CardTitle>פרופיל והקישור שלי</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">שם מלא</Label>
            <Input
              id="fullName"
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">טלפון</Label>
            <Input
              id="phone"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="professionType">תחום עיסוק</Label>
            <Select
              value={profile.professionType ?? ""}
              onValueChange={(v) =>
                setProfile((p) => ({ ...p, professionType: v as ProfileState["professionType"] }))
              }
            >
              <SelectTrigger id="professionType">
                <SelectValue placeholder="בחר תחום" />
              </SelectTrigger>
              <SelectContent>
                {PROFESSION_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROFESSION_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">הכתובת שלך</Label>
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span>cleana.co.il/book/</span>
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
              <p className="text-muted-foreground text-xs">
                ניתן לשנות את הכתובת רק פעם ב-30 יום
              </p>
            )}
          </div>
          {profileError && <p className="text-destructive text-sm">{profileError}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" disabled={profileSaving} onClick={saveProfile} className="w-fit">
              {profileSaving ? "שומר..." : "שמור פרופיל"}
            </Button>
            {profileSaved && <span className="text-sm text-green-600">נשמר ✓</span>}
          </div>
        </CardContent>
      </Card>

      {/* זמני טיפול */}
      <Card>
        <CardHeader>
          <CardTitle>זמני טיפול</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="duration">משך טיפול ברירת מחדל</Label>
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
                    {d} דקות
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bufferBefore">זמן הכנה לפני (דקות)</Label>
              <Input
                id="bufferBefore"
                type="number"
                min={0}
                value={settings.bufferBeforeMinutes}
                onChange={(e) => updateSettings("bufferBeforeMinutes", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bufferAfter">זמן ניקיון אחרי (דקות)</Label>
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
              <Label htmlFor="minNotice">מינימום שעות מראש</Label>
              <Input
                id="minNotice"
                type="number"
                min={0}
                value={settings.minNoticeHours}
                onChange={(e) => updateSettings("minNoticeHours", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxAdvance">עד כמה ימים קדימה</Label>
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

      {/* מיקום */}
      <Card>
        <CardHeader>
          <CardTitle>מיקום</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationType">סוג מיקום</Label>
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
                    {LOCATION_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(settings.locationType === "clinic" ||
            settings.locationType === "client_home" ||
            settings.locationType === "hybrid") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="locationAddress">כתובת</Label>
              <Input
                id="locationAddress"
                value={settings.locationAddress}
                onChange={(e) => updateSettings("locationAddress", e.target.value)}
              />
            </div>
          )}
          {(settings.locationType === "online" || settings.locationType === "hybrid") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="onlineMeetingUrl">קישור למפגש מקוון</Label>
              <Input
                id="onlineMeetingUrl"
                dir="ltr"
                value={settings.onlineMeetingUrl}
                onChange={(e) => updateSettings("onlineMeetingUrl", e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationNotes">הוראות הגעה, חניה</Label>
            <Input
              id="locationNotes"
              value={settings.locationNotes}
              onChange={(e) => updateSettings("locationNotes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* מדיניות ביטול והזמנות */}
      <Card>
        <CardHeader>
          <CardTitle>מדיניות ביטול והזמנות</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellationHours">עד כמה שעות לפני מותר לבטל</Label>
            <Input
              id="cancellationHours"
              type="number"
              min={0}
              value={settings.cancellationPolicyHours}
              onChange={(e) => updateSettings("cancellationPolicyHours", Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellationText">טקסט מדיניות ביטול (מוצג ללקוח)</Label>
            <Input
              id="cancellationText"
              value={settings.cancellationPolicyText}
              onChange={(e) => updateSettings("cancellationPolicyText", e.target.value)}
            />
          </div>
          <ToggleRow
            label="דרוש טלפון בטופס ההזמנה"
            checked={settings.requirePhone}
            onChange={(v) => updateSettings("requirePhone", v)}
          />
          <ToggleRow
            label="אישור הזמנה אוטומטי"
            checked={settings.autoConfirm}
            onChange={(v) => updateSettings("autoConfirm", v)}
          />
        </CardContent>
      </Card>

      {/* התראות */}
      <Card>
        <CardHeader>
          <CardTitle>התראות</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            label="שליחת אישור הזמנה במייל"
            checked={settings.sendEmailConfirmation}
            onChange={(v) => updateSettings("sendEmailConfirmation", v)}
          />
          <ToggleRow
            label="תזכורת במייל"
            checked={settings.sendEmailReminder}
            onChange={(v) => updateSettings("sendEmailReminder", v)}
          />
          <ToggleRow
            label="תזכורת ב-SMS"
            checked={settings.sendSmsReminder}
            onChange={(v) => updateSettings("sendSmsReminder", v)}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="reminderHours">כמה שעות לפני לשלוח תזכורת</Label>
            <Input
              id="reminderHours"
              type="number"
              min={0}
              value={settings.reminderHoursBefore}
              onChange={(e) => updateSettings("reminderHoursBefore", Number(e.target.value))}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            שליחה בפועל של הודעות תיכנס בשלב הבא — כרגע ההעדפות נשמרות בלבד.
          </p>
        </CardContent>
      </Card>

      {/* מיתוג */}
      <Card>
        <CardHeader>
          <CardTitle>מיתוג</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookingPageHeadline">כותרת בדף ההזמנה</Label>
            <Input
              id="bookingPageHeadline"
              value={settings.bookingPageHeadline}
              onChange={(e) => updateSettings("bookingPageHeadline", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookingPageDescription">תיאור קצר</Label>
            <Input
              id="bookingPageDescription"
              value={settings.bookingPageDescription}
              onChange={(e) => updateSettings("bookingPageDescription", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brandColor">צבע מותג</Label>
            <Input
              id="brandColor"
              type="color"
              className="h-10 w-16 p-1"
              value={settings.brandColor || "#000000"}
              onChange={(e) => updateSettings("brandColor", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brandLogoUrl">קישור ללוגו</Label>
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
          {settingsSaving ? "שומר..." : "שמור הגדרות"}
        </Button>
        {settingsSaved && <span className="text-sm text-green-600">נשמר ✓</span>}
      </div>

      {/* פרטיות */}
      <Card>
        <CardHeader>
          <CardTitle>פרטיות</CardTitle>
          <CardDescription>הנתונים שלך בלבד — לא נחשפים ללקוחות אחרים</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="outline" className="w-full md:w-fit">
            <a href="/api/me/export">ייצוא הנתונים שלי (JSON)</a>
          </Button>
          <p className="text-muted-foreground text-xs">
            ניהול החשבון וההתחברות (כולל מחיקת חשבון) מתבצע דרך תפריט המשתמש למעלה.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
