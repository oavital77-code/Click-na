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
import { cn } from "@/lib/utils";
import {
  DURATION_OPTIONS,
  LOCATION_TYPES,
  PROFESSION_TYPES,
  onboardingSchema,
  type OnboardingInput,
} from "@/lib/onboarding-schema";
import { useI18n } from "@/i18n/client";

type SlugCheckStatus = "idle" | "checking" | "available" | "unavailable";

type Props = {
  initialFullName: string;
  initialPhone: string;
  initialSlug: string;
};

export function OnboardingWizard({ initialFullName, initialPhone, initialSlug }: Props) {
  const router = useRouter();
  const { m, issue } = useI18n();
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
      setSubmitError(issue(parsed.error.issues[0]?.message));
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
          data.error === "slug_taken" ? m.onboarding.slugTakenMeanwhile : m.onboarding.saveError
        );
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setSubmitError(m.common.networkError);
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.onboarding.title}</CardTitle>
        <CardDescription>{m.onboarding.step(step, 4)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">{m.settings.fullName}</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{m.settings.phone}</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="professionType">{m.settings.profession}</Label>
              <Select
                value={professionType}
                onValueChange={(v) => setProfessionType(v as (typeof PROFESSION_TYPES)[number])}
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
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">{m.settings.yourAddress}</Label>
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span>{bookingLinkPrefix()}</span>
              <Input
                id="slug"
                dir="ltr"
                className="w-auto flex-1 text-start"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
              />
            </div>
            {slugStatus === "checking" && (
              <p className="text-muted-foreground text-sm">{m.onboarding.checking}</p>
            )}
            {slugStatus === "available" && (
              <p className="text-sm text-green-600">{m.onboarding.available}</p>
            )}
            {slugStatus === "unavailable" && (
              <p className="text-destructive text-sm">
                {slugReason === "reserved"
                  ? m.validation.slugReserved
                  : slugReason === "format"
                    ? m.validation.slugFormat
                    : m.settings.slugTaken}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">{m.onboarding.duration}</Label>
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
                      {m.common.minutes(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="locationType">{m.onboarding.location}</Label>
              <Select
                value={locationType}
                onValueChange={(v) => setLocationType(v as (typeof LOCATION_TYPES)[number])}
              >
                <SelectTrigger id="locationType">
                  <SelectValue placeholder={m.onboarding.pickLocation} />
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
            {(locationType === "clinic" ||
              locationType === "client_home" ||
              locationType === "hybrid") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="locationAddress">{m.settings.address}</Label>
                <Input
                  id="locationAddress"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                />
              </div>
            )}
            {(locationType === "online" || locationType === "hybrid") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="onlineMeetingUrl">{m.settings.meetingUrl}</Label>
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
              <Label>{m.onboarding.whenFree}</Label>
              <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                {m.labels.days.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors md:min-h-9",
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="startTime">{m.onboarding.from}</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endTime">{m.onboarding.to}</Label>
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

        <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            variant="outline"
            className="w-full md:w-auto"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
          >
            {m.onboarding.prev}
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              className="w-full md:w-auto"
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              {m.common.next}
            </Button>
          ) : (
            <Button type="button" className="w-full md:w-auto" disabled={days.length === 0 || submitting} onClick={handleSubmit}>
              {submitting ? m.common.saving : m.onboarding.finish}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
