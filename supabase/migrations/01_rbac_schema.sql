-- ============================================================
-- ResumeFlow RBAC Migration v1 — SELF-CONTAINED
-- Safe to run on a fresh database OR an existing one.
-- Run the ENTIRE script at once in Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- STEP 0: Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STEP 1: ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'tl', 'recruiter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE candidate_status AS ENUM ('uploaded', 'scored', 'shortlisted', 'interview', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('tl', 'recruiter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- STEP 2: users table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  name      TEXT,
  role      user_role NOT NULL DEFAULT 'recruiter',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-insert user row on auth sign-up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'recruiter')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- STEP 3: teams table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tl_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STEP 4: team_members table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_in_team team_role NOT NULL DEFAULT 'recruiter',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- ============================================================
-- STEP 5: activity_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STEP 6: notifications table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT,
  entity_type TEXT,
  entity_id   UUID,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STEP 7: Core tables — CREATE IF NOT EXISTS (idempotent)
-- ============================================================

-- jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_title            TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  job_description_text TEXT,
  required_skills      TEXT[] DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'active',
  created_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_team_id     UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- If the table already existed, ensure the new columns are present
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_by from recruiter_id if that column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'recruiter_id'
  ) THEN
    UPDATE public.jobs SET created_by = recruiter_id WHERE created_by IS NULL AND recruiter_id IS NOT NULL;
  END IF;
END $$;

-- candidates
CREATE TABLE IF NOT EXISTS public.candidates (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name               TEXT,
  email              TEXT,
  phone              TEXT,
  resume_file_path   TEXT,
  resume_file_name   TEXT,
  resume_hash        TEXT,
  processing_status  TEXT NOT NULL DEFAULT 'pending',
  status             candidate_status NOT NULL DEFAULT 'uploaded',
  error_message      TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS status candidate_status NOT NULL DEFAULT 'uploaded';

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS resume_hash TEXT;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- resume_scores
CREATE TABLE IF NOT EXISTS public.resume_scores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  score             NUMERIC(5,2),
  status            TEXT,
  matched_skills    TEXT[] DEFAULT '{}',
  missing_skills    TEXT[] DEFAULT '{}',
  strengths         TEXT[] DEFAULT '{}',
  weaknesses        TEXT[] DEFAULT '{}',
  summary           TEXT,
  experience_match  NUMERIC(5,2),
  education_match   NUMERIC(5,2),
  model_used        TEXT,
  scored_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resume_scores
  ADD COLUMN IF NOT EXISTS model_used TEXT;

ALTER TABLE public.resume_scores
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- ============================================================
-- STEP 8: Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_role         ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_teams_manager_id   ON public.teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_teams_tl_id        ON public.teams(tl_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team  ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user  ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by    ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_team          ON public.jobs(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status  ON public.candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_hash    ON public.candidates(resume_hash);

-- ============================================================
-- STEP 9: updated_at trigger function (safe to recreate)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Attach trigger to jobs (idempotent)
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attach trigger to candidates (idempotent)
DROP TRIGGER IF EXISTS update_candidates_updated_at ON public.candidates;
CREATE TRIGGER update_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STEP 10: Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::TEXT FROM public.users WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(tid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = tid AND user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_manager(tid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = tid AND manager_id = uid
  );
$$;

-- ============================================================
-- STEP 11: Enable RLS
-- ============================================================
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_scores ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 12: Drop old policies (safe — IF EXISTS)
-- ============================================================
DROP POLICY IF EXISTS "Recruiters can manage their own jobs"        ON public.jobs;
DROP POLICY IF EXISTS "Recruiters can manage their own candidates"  ON public.candidates;
DROP POLICY IF EXISTS "Recruiters can view scores for their candidates" ON public.resume_scores;

-- Drop any pre-existing RBAC policies so re-running is safe
DROP POLICY IF EXISTS "users_select_own"               ON public.users;
DROP POLICY IF EXISTS "users_admin_all"                ON public.users;
DROP POLICY IF EXISTS "teams_select"                   ON public.teams;
DROP POLICY IF EXISTS "teams_admin_manager_write"      ON public.teams;
DROP POLICY IF EXISTS "team_members_select"            ON public.team_members;
DROP POLICY IF EXISTS "team_members_admin_manager_write" ON public.team_members;
DROP POLICY IF EXISTS "jobs_admin_all"                 ON public.jobs;
DROP POLICY IF EXISTS "jobs_manager_own_teams"         ON public.jobs;
DROP POLICY IF EXISTS "jobs_tl_team"                   ON public.jobs;
DROP POLICY IF EXISTS "jobs_recruiter_team"            ON public.jobs;
DROP POLICY IF EXISTS "candidates_admin_all"           ON public.candidates;
DROP POLICY IF EXISTS "candidates_manager_teams"       ON public.candidates;
DROP POLICY IF EXISTS "candidates_tl_team"             ON public.candidates;
DROP POLICY IF EXISTS "candidates_recruiter_own"       ON public.candidates;
DROP POLICY IF EXISTS "scores_admin_all"               ON public.resume_scores;
DROP POLICY IF EXISTS "scores_manager_teams"           ON public.resume_scores;
DROP POLICY IF EXISTS "scores_tl_team"                 ON public.resume_scores;
DROP POLICY IF EXISTS "scores_recruiter_own"           ON public.resume_scores;
DROP POLICY IF EXISTS "service_role_resume_scores"     ON public.resume_scores;
DROP POLICY IF EXISTS "service_role_candidates"        ON public.candidates;
DROP POLICY IF EXISTS "service_role_jobs"              ON public.jobs;
DROP POLICY IF EXISTS "activity_logs_admin_all"        ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_service_role"     ON public.activity_logs;
DROP POLICY IF EXISTS "notifications_own"              ON public.notifications;
DROP POLICY IF EXISTS "notifications_service_role"     ON public.notifications;

-- ============================================================
-- STEP 13: New RLS policies
-- ============================================================

-- ---- users ----
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR public.get_user_role() = 'admin');

CREATE POLICY "users_admin_all"
  ON public.users FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ---- teams ----
CREATE POLICY "teams_select"
  ON public.teams FOR SELECT
  USING (
    public.get_user_role() IN ('admin', 'manager')
    OR manager_id = auth.uid()
    OR tl_id = auth.uid()
    OR public.is_team_member(id)
  );

CREATE POLICY "teams_admin_manager_write"
  ON public.teams FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ---- team_members ----
CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT
  USING (
    public.get_user_role() IN ('admin', 'manager')
    OR user_id = auth.uid()
    OR public.is_team_member(team_id)
  );

CREATE POLICY "team_members_admin_manager_write"
  ON public.team_members FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ---- jobs ----
CREATE POLICY "jobs_admin_all"
  ON public.jobs FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "jobs_manager_own_teams"
  ON public.jobs FOR ALL
  USING (
    public.get_user_role() = 'manager'
    AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.teams WHERE id = public.jobs.assigned_team_id AND manager_id = auth.uid())
    )
  )
  WITH CHECK (public.get_user_role() = 'manager');

CREATE POLICY "jobs_tl_team"
  ON public.jobs FOR SELECT
  USING (
    public.get_user_role() = 'tl'
    AND EXISTS (
      SELECT 1 FROM public.teams WHERE id = public.jobs.assigned_team_id AND tl_id = auth.uid()
    )
  );

CREATE POLICY "jobs_recruiter_team"
  ON public.jobs FOR SELECT
  USING (
    public.get_user_role() = 'recruiter'
    AND public.is_team_member(assigned_team_id)
  );

CREATE POLICY "service_role_jobs"
  ON public.jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---- candidates ----
CREATE POLICY "candidates_admin_all"
  ON public.candidates FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "candidates_manager_teams"
  ON public.candidates FOR ALL
  USING (
    public.get_user_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.teams t ON t.id = j.assigned_team_id
      WHERE j.id = public.candidates.job_id AND t.manager_id = auth.uid()
    )
  )
  WITH CHECK (public.get_user_role() = 'manager');

CREATE POLICY "candidates_tl_team"
  ON public.candidates FOR ALL
  USING (
    public.get_user_role() = 'tl'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.teams t ON t.id = j.assigned_team_id
      WHERE j.id = public.candidates.job_id AND t.tl_id = auth.uid()
    )
  )
  WITH CHECK (public.get_user_role() = 'tl');

CREATE POLICY "candidates_recruiter_own"
  ON public.candidates FOR ALL
  USING (public.get_user_role() = 'recruiter' AND recruiter_id = auth.uid())
  WITH CHECK (public.get_user_role() = 'recruiter' AND recruiter_id = auth.uid());

CREATE POLICY "service_role_candidates"
  ON public.candidates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---- resume_scores ----
CREATE POLICY "scores_admin_all"
  ON public.resume_scores FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "scores_manager_teams"
  ON public.resume_scores FOR SELECT
  USING (
    public.get_user_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.teams t ON t.id = j.assigned_team_id
      WHERE c.id = public.resume_scores.candidate_id AND t.manager_id = auth.uid()
    )
  );

CREATE POLICY "scores_tl_team"
  ON public.resume_scores FOR SELECT
  USING (
    public.get_user_role() = 'tl'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.teams t ON t.id = j.assigned_team_id
      WHERE c.id = public.resume_scores.candidate_id AND t.tl_id = auth.uid()
    )
  );

CREATE POLICY "scores_recruiter_own"
  ON public.resume_scores FOR SELECT
  USING (
    public.get_user_role() = 'recruiter'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = public.resume_scores.candidate_id AND c.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "service_role_resume_scores"
  ON public.resume_scores FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---- activity_logs ----
CREATE POLICY "activity_logs_admin_all"
  ON public.activity_logs FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "activity_logs_service_role"
  ON public.activity_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---- notifications ----
CREATE POLICY "notifications_own"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_service_role"
  ON public.notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- STEP 14: Storage – resumes bucket RLS
-- ============================================================
DROP POLICY IF EXISTS "Recruiters can upload resumes"        ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can view their resumes"    ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can delete their resumes"  ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage all resumes"  ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload resumes"        ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view resumes"          ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete their resumes"  ON storage.objects;

CREATE POLICY "Auth users can upload resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

CREATE POLICY "Auth users can view resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');

CREATE POLICY "Auth users can delete their resumes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage all resumes"
  ON storage.objects FOR ALL
  USING (bucket_id = 'resumes');

-- ============================================================
-- DONE ✅
-- After running, set your admin user:
--
--   UPDATE public.users SET role = 'admin', name = 'Your Name'
--   WHERE email = 'your@email.com';
--
-- If you are a brand new user (just signed up), run:
--
--   INSERT INTO public.users (id, email, role, name)
--   SELECT id, email, 'admin', 'Admin'
--   FROM auth.users
--   WHERE email = 'your@email.com'
--   ON CONFLICT (id) DO UPDATE SET role = 'admin';
-- ============================================================

-- ============================================================
-- STEP 8: Many-to-many junction tables
-- ============================================================

-- Many jobs → many teams
CREATE TABLE IF NOT EXISTS public.job_teams (
  job_id  UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, team_id)
);

-- TL / admin / manager assigns a job to a recruiter
CREATE TABLE IF NOT EXISTS public.job_recruiter_assignments (
  job_id        UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (job_id, recruiter_id)
);
