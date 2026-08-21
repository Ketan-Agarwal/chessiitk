-- Supabase PostgreSQL Database Schema for Chess Club IITK

-- Drop existing tables if they exist to allow clean replay
DROP TABLE IF EXISTS blogs CASCADE;
DROP TABLE IF EXISTS pending_otps CASCADE;
DROP TABLE IF EXISTS site_config CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS featured_carousel CASCADE;
DROP TABLE IF EXISTS gallery CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email varchar(255) NOT NULL UNIQUE,
    chess_username varchar(100) NOT NULL,
    password_hash varchar(255) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    token_version integer NOT NULL DEFAULT 0,
    is_admin boolean DEFAULT FALSE,
    name varchar(255) NOT NULL DEFAULT 'Grandmaster Apprentice',
    roll_no varchar(50) NOT NULL DEFAULT 'XXXXXX',
    contact varchar(20) NOT NULL DEFAULT '0000000000',
    avatar text,
    secondary_email varchar(255) NOT NULL
);

-- 2. Pending OTPs Table
CREATE TABLE pending_otps (
    email varchar(255) PRIMARY KEY,
    otp varchar(6) NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- 3. Site Config Table
CREATE TABLE site_config (
    config_key varchar(50) PRIMARY KEY,
    config_value text
);

-- 4. Featured Carousel Table
CREATE TABLE featured_carousel (
    id SERIAL PRIMARY KEY,
    image_url varchar(500) NOT NULL
);

-- 5. Events Table
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title varchar(255) NOT NULL,
    event_type varchar(50) NOT NULL,
    short_description varchar(500) DEFAULT NULL,
    event_briefing text,
    event_date date NOT NULL,
    event_time varchar(100) NOT NULL,
    location varchar(255) DEFAULT NULL,
    format varchar(255) DEFAULT NULL,
    register_link varchar(500) DEFAULT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- 6. Gallery Table
CREATE TABLE gallery (
    id SERIAL PRIMARY KEY,
    image_url varchar(512) NOT NULL,
    category varchar(50) NOT NULL,
    album_type varchar(50) NOT NULL,
    title varchar(255) DEFAULT NULL,
    description text,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- 7. Blogs Table (depends on users.email)
CREATE TABLE blogs (
    id SERIAL PRIMARY KEY,
    title varchar(255) NOT NULL,
    subtitle varchar(500) DEFAULT NULL,
    content text NOT NULL,
    cover_image text,
    author_email varchar(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
    author_name varchar(255) DEFAULT NULL,
    author_position varchar(255) DEFAULT NULL
);

-- Trigger to automatically update updated_at on blogs update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_blogs_updated_at
    BEFORE UPDATE ON blogs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) on all tables to secure them from client-side anon API access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_carousel ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
