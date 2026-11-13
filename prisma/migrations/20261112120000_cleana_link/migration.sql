-- Link to the therapist's Cleana account (room rental), so a room booked there
-- can open slots here. Stored as an ordinary integration row; see src/lib/cleana-link.ts.
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'cleana';
