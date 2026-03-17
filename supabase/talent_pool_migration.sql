-- ============================================================
-- Talent Pool table — run this in Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_pool (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dedup key: only one row per unique email
  email                TEXT,
  name                 TEXT,
  phone                TEXT,
  resume_file_path     TEXT NOT NULL,
  resume_file_name     TEXT NOT NULL,
  resume_hash          TEXT,
  extracted_skills     TEXT[]    DEFAULT '{}',
  extracted_titles     TEXT[]    DEFAULT '{}',
  experience_years     NUMERIC(4,1),
  current_location     TEXT,
  -- Who originally uploaded this candidate (not deleted when user is deleted, set to NULL)
  uploaded_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Job context at time of upload (stored as plain text/id — no FK so job deletion is safe)
  first_seen_job_id    UUID,
  first_seen_job_title TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: only enforce email uniqueness for non-NULL emails
-- This allows multiple rows with NULL email (candidates where email not yet extracted)
CREATE UNIQUE INDEX IF NOT EXISTS talent_pool_email_unique
  ON talent_pool (email)
  WHERE email IS NOT NULL;

-- Also unique on resume_hash so we can find and update the row after AI processing
CREATE UNIQUE INDEX IF NOT EXISTS talent_pool_hash_unique
  ON talent_pool (resume_hash)
  WHERE resume_hash IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS talent_pool_uploaded_by_idx ON talent_pool (uploaded_by);
CREATE INDEX IF NOT EXISTS talent_pool_created_at_idx  ON talent_pool (created_at DESC);
CREATE INDEX IF NOT EXISTS talent_pool_location_idx    ON talent_pool (current_location);

-- Optional: updated_at trigger
CREATE OR REPLACE FUNCTION update_talent_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS talent_pool_updated_at_trigger ON talent_pool;
CREATE TRIGGER talent_pool_updated_at_trigger
  BEFORE UPDATE ON talent_pool
  FOR EACH ROW EXECUTE FUNCTION update_talent_pool_updated_at();

-- ============================================================
-- BACKFILL: Copy all existing candidates into talent_pool
-- Run this after creating the table to populate it with
-- candidates that were uploaded before this migration.
-- Uses email for deduplication (ON CONFLICT DO NOTHING).
-- ============================================================

INSERT INTO talent_pool (
  email,
  name,
  phone,
  resume_file_path,
  resume_file_name,
  resume_hash,
  extracted_skills,
  extracted_titles,
  experience_years,
  current_location,
  uploaded_by,
  first_seen_job_id,
  first_seen_job_title,
  created_at
)
SELECT DISTINCT ON (COALESCE(c.email, c.id::text))
  c.email,
  c.name,
  c.phone,
  c.resume_file_path,
  c.resume_file_name,
  c.resume_hash,
  COALESCE(c.extracted_skills, '{}'),
  COALESCE(c.extracted_titles, '{}'),
  c.experience_years,
  c.current_location,
  c.recruiter_id,
  c.job_id,
  j.job_title
FROM candidates c
LEFT JOIN jobs j ON j.id = c.job_id
ORDER BY COALESCE(c.email, c.id::text), c.created_at ASC
ON CONFLICT DO NOTHING;

