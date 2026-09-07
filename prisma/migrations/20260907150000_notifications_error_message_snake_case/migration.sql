-- The only column on this table that skipped @map, so it was created as
-- "errorMessage" while every sibling is snake_case — meaning any hand-written
-- SQL against it needed quoting, and only for this one column. Renaming is
-- safe: the data moves with the column.
ALTER TABLE "notifications" RENAME COLUMN "errorMessage" TO "error_message";
