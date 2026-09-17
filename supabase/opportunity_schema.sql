-- Opportunity Intelligence Schema (Phase 1)
-- Table definition with strict user-ownership and strict RLS

CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'INTERNSHIP', 'JOB', 'HACKATHON', 'SCHOLARSHIP', 'FELLOWSHIP', 
    'COMPETITION', 'WORKSHOP', 'CERTIFICATION', 'RESEARCH', 'OTHER'
  )),
  role TEXT,
  description TEXT,
  eligibility TEXT,
  education_requirements TEXT,
  branch_requirements TEXT,
  skills_required TEXT[],
  location TEXT,
  work_mode TEXT CHECK (work_mode IN ('REMOTE', 'HYBRID', 'ON_SITE')),
  stipend TEXT,
  salary TEXT,
  deadline DATE,
  application_url TEXT,
  source TEXT DEFAULT 'MANUAL',
  source_identifier TEXT,
  confidence NUMERIC DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW', 'SAVED', 'INTERESTED', 'APPLIED', 'INTERVIEW', 
    'SELECTED', 'REJECTED', 'NOT_INTERESTED', 'EXPIRED'
  )),
  sources_history JSONB DEFAULT '[]'::jsonb,
  evidence_snippets TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safely add Phase 3, Phase 4B, and Phase 6 Calendar migration columns
ALTER TABLE public.opportunities ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.opportunities ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS sources_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS evidence_snippets TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS calendar_synced BOOLEAN DEFAULT false;

-- Phase 4B Gmail Sync Checkpoint & Metrics Table
CREATE TABLE IF NOT EXISTS public.gmail_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_history_id TEXT,
  last_message_id TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  processed_message_ids TEXT[] DEFAULT '{}'::text[],
  total_emails_processed INTEGER DEFAULT 0,
  total_opportunities_detected INTEGER DEFAULT 0,
  total_opportunities_saved INTEGER DEFAULT 0,
  total_duplicates_merged INTEGER DEFAULT 0,
  total_needs_review INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Student Profile Table (Single Source of Truth for Opportunity Intelligence)
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE DEFAULT auth.uid(),
  full_name TEXT,
  college TEXT,
  branch TEXT,
  degree TEXT,
  current_year TEXT,
  graduation_year INT,
  skills TEXT[] DEFAULT '{}'::text[],
  skill_proficiencies JSONB DEFAULT '{}'::jsonb,
  relevant_project_technologies TEXT[] DEFAULT '{}'::text[],
  career_target_roles TEXT[] DEFAULT '{}'::text[],
  interests TEXT[] DEFAULT '{}'::text[],
  learning_goals TEXT[] DEFAULT '{}'::text[],
  preferred_opportunity_types TEXT[] DEFAULT '{}'::text[],
  preferred_locations TEXT[] DEFAULT '{}'::text[],
  preferred_work_modes TEXT[] DEFAULT '{}'::text[],
  min_stipend TEXT,
  expected_salary TEXT,
  availability_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own student profile" ON public.student_profiles;
DROP POLICY IF EXISTS "Users can manage their own student profile" ON public.student_profiles;
CREATE POLICY "Users can view their own student profile" ON public.student_profiles FOR SELECT USING (true);
CREATE POLICY "Users can manage their own student profile" ON public.student_profiles FOR ALL USING (true);

-- Enable RLS on gmail_sync_checkpoints
ALTER TABLE public.gmail_sync_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own gmail checkpoints" ON public.gmail_sync_checkpoints;
DROP POLICY IF EXISTS "Users can manage their own gmail checkpoints" ON public.gmail_sync_checkpoints;

CREATE POLICY "Users can view their own gmail checkpoints"
  ON public.gmail_sync_checkpoints FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own gmail checkpoints"
  ON public.gmail_sync_checkpoints FOR ALL USING (auth.uid() = user_id);

-- Clean policies safely before creation
DROP POLICY IF EXISTS "Users can view their own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can insert their own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can update their own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can delete their own opportunities" ON public.opportunities;

-- Create strict user ownership RLS policies
CREATE POLICY "Users can view their own opportunities"
  ON public.opportunities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own opportunities"
  ON public.opportunities FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own opportunities"
  ON public.opportunities FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own opportunities"
  ON public.opportunities FOR DELETE USING (auth.uid() = user_id);
