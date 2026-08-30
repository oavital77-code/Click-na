-- CreateEnum
CREATE TYPE "ProfessionType" AS ENUM ('coach', 'massage', 'trainer', 'therapist', 'tutor', 'other');

-- CreateEnum
CREATE TYPE "TherapistStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'basic', 'pro', 'business');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('clinic', 'online', 'client_home', 'hybrid');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('open', 'held', 'booked', 'blocked', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'canceled_by_client', 'canceled_by_therapist', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('confirmation', 'reminder', 'cancellation', 'reschedule');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('therapist', 'client', 'system', 'admin');

-- CreateTable
CREATE TABLE "therapists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "slug" VARCHAR(40) NOT NULL,
    "profession_type" "ProfessionType" NOT NULL,
    "clerk_user_id" VARCHAR(255),
    "stripe_customer_id" VARCHAR(255),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Jerusalem',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'he',
    "status" "TherapistStatus" NOT NULL DEFAULT 'active',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "therapists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "stripe_subscription_id" VARCHAR(255),
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "trial_ends_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "therapist_settings" (
    "therapist_id" UUID NOT NULL,
    "default_duration_minutes" INTEGER NOT NULL DEFAULT 50,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "min_notice_hours" INTEGER NOT NULL DEFAULT 12,
    "max_advance_days" INTEGER NOT NULL DEFAULT 60,
    "location_type" "LocationType" NOT NULL DEFAULT 'clinic',
    "location_address" TEXT,
    "location_notes" TEXT,
    "online_meeting_url" TEXT,
    "cancellation_policy_hours" INTEGER NOT NULL DEFAULT 24,
    "cancellation_policy_text" TEXT,
    "require_phone" BOOLEAN NOT NULL DEFAULT true,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT true,
    "send_email_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "send_email_reminder" BOOLEAN NOT NULL DEFAULT false,
    "send_sms_reminder" BOOLEAN NOT NULL DEFAULT false,
    "reminder_hours_before" INTEGER NOT NULL DEFAULT 24,
    "brand_color" VARCHAR(7),
    "brand_logo_url" TEXT,
    "booking_page_headline" VARCHAR(255),
    "booking_page_description" TEXT,

    CONSTRAINT "therapist_settings_pkey" PRIMARY KEY ("therapist_id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATE,
    "valid_until" DATE,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'open',
    "generated_from_rule_id" UUID,
    "hold_expires_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "notes" VARCHAR(200),
    "total_bookings" INTEGER NOT NULL DEFAULT 0,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_name_snapshot" VARCHAR(255) NOT NULL,
    "client_email_snapshot" VARCHAR(255),
    "client_phone_snapshot" VARCHAR(50),
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "client_note" VARCHAR(200),
    "manage_token" VARCHAR(64) NOT NULL,
    "canceled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "scheduled_for" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "therapists_email_key" ON "therapists"("email");

-- CreateIndex
CREATE UNIQUE INDEX "therapists_slug_key" ON "therapists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "therapists_clerk_user_id_key" ON "therapists"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "therapists_stripe_customer_id_key" ON "therapists"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_therapist_id_key" ON "subscriptions"("therapist_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "availability_rules_therapist_id_idx" ON "availability_rules"("therapist_id");

-- CreateIndex
CREATE INDEX "sessions_therapist_id_starts_at_idx" ON "sessions"("therapist_id", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_therapist_id_status_starts_at_idx" ON "sessions"("therapist_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "clients_therapist_id_email_key" ON "clients"("therapist_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_session_id_key" ON "bookings"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_manage_token_key" ON "bookings"("manage_token");

-- CreateIndex
CREATE INDEX "bookings_therapist_id_status_idx" ON "bookings"("therapist_id", "status");

-- CreateIndex
CREATE INDEX "notifications_booking_id_idx" ON "notifications"("booking_id");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "audit_logs_therapist_id_created_at_idx" ON "audit_logs"("therapist_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "therapist_settings" ADD CONSTRAINT "therapist_settings_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_generated_from_rule_id_fkey" FOREIGN KEY ("generated_from_rule_id") REFERENCES "availability_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent overlapping sessions per therapist at the database level
-- (spec section 6.2 idx_no_overlap / section 11.1 race-condition defense).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_no_overlap"
  EXCLUDE USING gist (
    "therapist_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE (status IN ('open', 'held', 'booked'));
