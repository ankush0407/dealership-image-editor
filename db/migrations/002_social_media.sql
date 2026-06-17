-- Migration 002: Social media posting feature
-- Run with: psql $DATABASE_URL -f db/migrations/002_social_media.sql

-- ─── Users: social media add-on columns ────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS social_media_addon BOOLEAN NOT NULL DEFAULT false;

-- Zernio account IDs (one per connected social platform)
ALTER TABLE users ADD COLUMN IF NOT EXISTS zernio_fb_account_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS zernio_ig_account_id VARCHAR(200);  -- Phase 2
ALTER TABLE users ADD COLUMN IF NOT EXISTS fb_page_name VARCHAR(200);

-- VIN search URL template — e.g. "https://acemotors.com/inventory?vin={VIN}"
-- {VIN} placeholder is replaced with the folder's vin_name at post time
ALTER TABLE users ADD COLUMN IF NOT EXISTS vin_search_url_template TEXT;

-- Per-user default caption template with {year} {make} {model} etc. placeholders
ALTER TABLE users ADD COLUMN IF NOT EXISTS caption_template TEXT;

-- ─── VIN folders: listing details ──────────────────────────────────────────

-- All three fields must be non-null before a draft post can be auto-created
ALTER TABLE vin_folders ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
ALTER TABLE vin_folders ADD COLUMN IF NOT EXISTS condition VARCHAR(50)
  CHECK (condition IS NULL OR condition IN ('new', 'used', 'certified'));
ALTER TABLE vin_folders ADD COLUMN IF NOT EXISTS description TEXT;

-- Merged NHTSA decode + manual overrides
-- Keys used in caption: year, make, model, engine, fuel_type
ALTER TABLE vin_folders ADD COLUMN IF NOT EXISTS vin_details JSONB;

-- ─── Social posts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
  id                SERIAL PRIMARY KEY,
  vin_folder_id     INTEGER NOT NULL REFERENCES vin_folders(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform          VARCHAR(20) NOT NULL CHECK (platform IN ('facebook', 'instagram')),

  -- Zernio IDs
  zernio_post_id    VARCHAR(200),
  platform_post_id  VARCHAR(200),
  platform_post_url TEXT,

  -- Content
  hero_image_id     INTEGER REFERENCES images(id) ON DELETE SET NULL,
  caption           TEXT,
  first_comment     TEXT,

  -- Schedule
  scheduled_at      TIMESTAMP,

  -- Lifecycle
  -- draft    = auto-created, awaiting user approval
  -- scheduled = approved, Zernio will deliver at scheduled_at (or as soon as possible)
  -- posted   = Zernio confirmed delivery via webhook
  -- failed   = Zernio reported an error
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  error_message     TEXT,
  posted_at         TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_folder  ON social_posts(vin_folder_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_user    ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status  ON social_posts(status);
