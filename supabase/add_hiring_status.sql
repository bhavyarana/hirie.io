-- Add hiring_status and rejection_reason to candidates table
-- Run in Supabase SQL Editor

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS hiring_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hiring_feedback TEXT DEFAULT NULL;

-- Optional: index for filtering by status
CREATE INDEX IF NOT EXISTS candidates_hiring_status_idx ON candidates (hiring_status);
