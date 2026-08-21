CREATE TABLE IF NOT EXISTS security_rate_limits (
    rate_key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS security_rate_limits_window_idx
    ON security_rate_limits (window_started_at);
