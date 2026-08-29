"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";
import {
  DURATION_OPTIONS,
  LOCATION_TYPES,
  PROFESSION_TYPES,
  onboardingSchema,
  type OnboardingInput,
} from "@/lib/onboarding-schema";

const PROFESSION_LABELS: Record<(typeof PROFESSION_TYPES)[number], string> = {
  coach: "קאוצ'ינג",
  massage: "טיפולי מגע",
  trainer: "אימון אישי / כושר",
  therapist: "טיפול / ייעוץ",
  tutor: "הוראה פרטית",
  other: "אחר",
};

const LOCATION_LABELS: Record<(typeof LOCATION_TYPES)[number], string> = {
  clinic: "קליניקה",
  online: "אונליין",
  client_home: "בבית הלקוח",
  hybrid: "משולב",
};

const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

type SlugCheckStatus = "idle" | "checking" | "available" | "unavailable";

type Props = {
  initialFullName: string;
  initialPhone: string;
  initialSlug: string;
};

export function OnboardingWizard({ initialFullName, initialPhone, initialSlug }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [professionType, setProfessionType] =
    useState<(typeof PROFESSION_TYPES)[number] | "">("");

  const [slug, setSlug] = useState(initialSlug);
  const [slugStatus, setSlugStatus] = useState<SlugCheckStatus>("idle");
  const [slugReason, setSlugReason] = useState<string | undefined>();

  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState<number>(50);
  const [locationType, setLocationType] = useState<(typeof LOCATION_TYPES)[number] | "">("");
  const [locationAddress, setLocationAddress] = useState("");
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState("");

  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  useEffect(() => {
    if (slug === initialSlug) return; // unchanged from the assigned fallback slug — nothing to check

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/me/slug/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const data = await res.json();
        setSlugStatus(data.available ? "available" : "unavailable");
        setSlugReason(data.reason);
      } catch {
        setSlugStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [slug, initialSlug]);

  function handleSlugChange(value: string) {
    const next = value.toLowerCase();
    setSlug(next);
    setSlugStatus(next === initialSlug ? "idle" : "checking");
  }

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  const canProceedStep1 = fullName.trim().length >= 2 && phone.trim().length >= 7 && professionType;
  const canProceedStep2 =
    slug.length >= 3 && slugStatus !== "unavailable" && slugStatus !== "checking";
  const canProceedStep3 =
    locationType &&
    (locationType === "online"
      ? onlineMeetingUrl.trim().length > 0
      : locationType === "hybrid"
        ? locationAddress.trim().length > 0 || onlineMeetingUrl.trim().length > 0
        : locationAddress.trim().length > 0);

  async function handleSubmit() {
    setSubmitError(null);

    const payload: OnboardingInput = {
      fullName,
      phone,
      professionType: professionType as (typeof PROFESSION_TYPES)[number],
      slug,
      defaultDurationMinutes,
      locationType: locationType as (typeof LOCATION_TYPES)[number],
      locationAddress: locationAddress || undefined,
      onlineMeetingUrl: onlineMeetingUrl || undefined,
      availability: { days, startTime, endTime },
    };

    const parsed = onboardingSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? "יש לתקן את הטופס");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          data.error === "slug_taken" ? "הכתובת הזו נתפסה בינתיים, בחר אחרת" : "שגיאה בשמירה"
        );
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setSubmitError("שגיאת רשת, נסה שוב");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>בואו נכיר</CardTitle>
        <CardDescription>שלב {step} מתוך 4</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">שם מלא</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">טלפון</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="professionType">תחום עיסוק</Label>
              <Select
                value={professionType}
                onValueChange={(v) => setProfessionType(v as (typeof PROFESSION_TYPES)[number])}
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
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">הכתובת שלך</Label>
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span>cleana.co.il/book/</span>
              <Input
                id="slug"
                dir="ltr"
                className="w-auto flex-1 text-start"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
              />
            </div>
            {slugStatus === "checking" && (
              <p className="text-muted-foreground text-sm">בודק זמינות...</p>
            )}
            {slugStatus === "available" && (
              <p className="text-sm text-green-600">הכתובת פנויה ✓</p>
            )}
            {slugStatus === "unavailable" && (
              <p className="text-destructive text-sm">
                {slugReason === "reserved"
                  ? "כתובת זו שמורה"
                  : slugReason === "format"
                    ? "3-40 תווים: אותיות לטיניות קטנות, ספרות ומקפים בלבד"
                    : "הכתובת הזו כבר תפוסה"}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">משך טיפול</Label>
              <Select
                value={String(defaultDurationMinutes)}
                onValueChange={(v) => setDefaultDurationMinutes(Number(v))}
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="locationType">מיקום</Label>
              <Select
                value={locationType}
                onValueChange={(v) => setLocationType(v as (typeof LOCATION_TYPES)[number])}
              >
                <SelectTrigger id="locationType">
                  <SelectValue placeholder="בחר מיקום" />
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
            {(locationType === "clinic" ||
              locationType === "client_home" ||
              locationType === "hybrid") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="locationAddress">כתובת</Label>
                <Input
                  id="locationAddress"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                />
              </div>
            )}
            {(locationType === "online" || locationType === "hybrid") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="onlineMeetingUrl">קישור למפגש מקוון</Label>
                <Input
                  id="onlineMeetingUrl"
                  dir="ltr"
                  value={onlineMeetingUrl}
                  onChange={(e) => setOnlineMeetingUrl(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>מתי אתה פנוי?</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      days.includes(day)
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="startTime">משעה</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endTime">עד שעה</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {submitError && <p className="text-destructive text-sm">{submitError}</p>}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
          >
            הקודם
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              הבא
            </Button>
          ) : (
            <Button type="button" disabled={days.length === 0 || submitting} onClick={handleSubmit}>
              {submitting ? "שומר..." : "סיום"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
