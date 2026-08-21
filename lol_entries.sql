-- Create lolEntries table for League of Legends 6.0 event registration
CREATE TABLE IF NOT EXISTS "lolEntries" (
    id SERIAL PRIMARY KEY,
    event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email varchar(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    roll_no varchar(50) NOT NULL,
    chess_username varchar(100) NOT NULL,
    contact varchar(20) NOT NULL,
    secondary_email varchar(255) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, email)
);

-- Enable Row Level Security (RLS)
ALTER TABLE "lolEntries" ENABLE ROW LEVEL SECURITY;
