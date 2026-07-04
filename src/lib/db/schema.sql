-- SQLite Database Schema for MehSang Verification System

-- 1. Scanned Images Table
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    gdrive_file_id TEXT UNIQUE NOT NULL,
    image_url TEXT,
    upload_date TEXT NOT NULL,
    
    -- AI Predictions
    ai_style TEXT,
    ai_occasion TEXT,
    ai_coverage TEXT,
    ai_complexity TEXT,
    ai_elements TEXT, -- JSON stringified array
    ai_hand_side TEXT,
    ai_time_taken TEXT,
    ai_estimated_price REAL,
    ai_confidence REAL,
    ai_notes TEXT,
    
    -- Human Verification
    verified_style TEXT,
    verified_occasion TEXT,
    verified_coverage TEXT,
    verified_complexity TEXT,
    verified_elements TEXT, -- JSON stringified array
    verified_hand_side TEXT,
    verified_time_taken TEXT,
    verified_price REAL,
    verification_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    reviewer_name TEXT,
    review_date TEXT,
    comments TEXT
);

-- Indexing for search performance
CREATE INDEX IF NOT EXISTS idx_images_gdrive_file_id ON images(gdrive_file_id);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(verification_status);

-- 2. System Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 3. Users Table (Authorization & Roles)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- SHA-256 hash of password
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'REVIEWER'))
);
