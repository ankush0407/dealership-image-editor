-- Migration 003: Add zernio_profile_id to users
-- Run with: node -e "require('./scripts/migrate')(require('./db/migrations/003_zernio_profile.sql'))"
-- Or: psql $DATABASE_URL -f db/migrations/003_zernio_profile.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS zernio_profile_id VARCHAR(100);
