-- Payments was withdrawn from the product. Any row left behind holds an
-- encrypted Stripe secret key for a feature that no longer exists, so it is
-- removed rather than orphaned.
DELETE FROM "integrations" WHERE "provider" = 'payments';

-- The enum value itself stays: Postgres cannot drop a value from an enum in
-- place, and recreating the type to remove one dead label is not worth the risk.
