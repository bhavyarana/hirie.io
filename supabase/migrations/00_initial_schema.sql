-- ResumeFlow Database Schema v2
-- Run this in your Supabase SQL Editor
-- This version removes recruiter_id FK constraints (RLS handles isolation)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if re-running (cascade handles deps)
DROP TABLE IF EXISTS public.resume_scores CASCADE;
DROP TABLE IF EXISTS public.candidates CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;

-- =========================================
-- TABLE: jobs
-- Note: recruiter_id references auth.users implicitly via RLS
-- No explicit FK to avoid shadow-table resolution issues
-- =========================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recruiter_id UUID NOT NULL,
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_description_text TEXT NOT NULL,
  required_skills TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- TABLE: candidates
-- =========================================
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id UUID NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  resume_file_path TEXT NOT NULL,
  resume_file_name TEXT NOT NULL,
  raw_text TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- TABLE: resume_scores
-- =========================================
CREATE TABLE public.resume_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE UNIQUE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('pass', 'review', 'fail')),
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  matched_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  experience_match NUMERIC(5,2) DEFAULT 0,
  education_match NUMERIC(5,2) DEFAULT 0,
  summary TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- INDEXES
-- =========================================
CREATE INDEX idx_jobs_recruiter_id ON public.jobs(recruiter_id);
CREATE INDEX idx_candidates_job_id ON public.candidates(job_id);
CREATE INDEX idx_candidates_recruiter_id ON public.candidates(recruiter_id);
CREATE INDEX idx_resume_scores_candidate_id ON public.resume_scores(candidate_id);
CREATE INDEX idx_resume_scores_job_id ON public.resume_scores(job_id);

-- =========================================
-- ROW LEVEL SECURITY
-- =========================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_scores ENABLE ROW LEVEL SECURITY;

-- Jobs RLS
CREATE POLICY "Recruiters can manage their own jobs"
  ON public.jobs FOR ALL
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

-- Candidates RLS
CREATE POLICY "Recruiters can manage their own candidates"
  ON public.candidates FOR ALL
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

-- Resume scores RLS (via join to candidates)
CREATE POLICY "Recruiters can view scores for their candidates"
  ON public.resume_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = resume_scores.candidate_id
      AND c.recruiter_id = auth.uid()
    )
  );

-- =========================================
-- STORAGE BUCKET
-- =========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  20971520,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "Recruiters can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can view their resumes" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can delete their resumes" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage all resumes" ON storage.objects;

CREATE POLICY "Recruiters can upload resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Recruiters can view their resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Recruiters can delete their resumes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Service role can manage all resumes"
  ON storage.objects FOR ALL
  USING (bucket_id = 'resumes');

-- =========================================
-- UPDATED_AT TRIGGER
-- =========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
DROP TRIGGER IF EXISTS update_candidates_updated_at ON public.candidates;
DROP TRIGGER IF EXISTS update_resume_scores_updated_at ON public.resume_scores;

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resume_scores_updated_at BEFORE UPDATE ON public.resume_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
