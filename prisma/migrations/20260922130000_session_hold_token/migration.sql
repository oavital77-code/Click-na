-- A hold is now the holder's: the token handed back by /hold is required to
-- book the slot while the hold is live. Without it any caller who knew the
-- session id could book a slot somebody else was in the middle of taking.
ALTER TABLE "sessions" ADD COLUMN "hold_token" VARCHAR(64);
