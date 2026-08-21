ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_end_date DATE;

CREATE TABLE IF NOT EXISTS alumni_requests (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    roll_no VARCHAR(50),
    graduation_year VARCHAR(20),
    chess_username VARCHAR(100),
    contact VARCHAR(20),
    notes VARCHAR(2000),
    gender VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_chess_username_lower_unique
    ON users (LOWER(chess_username));
CREATE UNIQUE INDEX IF NOT EXISTS users_secondary_email_lower_unique
    ON users (LOWER(secondary_email));
CREATE UNIQUE INDEX IF NOT EXISTS alumni_one_pending_request_per_email
    ON alumni_requests (LOWER(email)) WHERE status = 'pending';

ALTER TABLE alumni_requests ENABLE ROW LEVEL SECURITY;
