-- Add candidate_id column to link talent_pool back to the original candidate record
-- Run this in Supabase SQL Editor

ALTER TABLE talent_pool
  ADD COLUMN IF NOT EXISTS candidate_id UUID;

-- Index for lookups
CREATE INDEX IF NOT EXISTS talent_pool_candidate_id_idx ON talent_pool (candidate_id);

-- Backfill candidate_id from the candidates table by matching resume_hash
UPDATE talent_pool tp
SET candidate_id = c.id
FROM candidates c
WHERE c.resume_hash = tp.resume_hash
  AND tp.candidate_id IS NULL;
