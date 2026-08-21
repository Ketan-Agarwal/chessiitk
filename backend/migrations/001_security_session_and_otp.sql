-- Apply once to the existing PostgreSQL production database before deploying.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
ALTER TABLE pending_otps ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
