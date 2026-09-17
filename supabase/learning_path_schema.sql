-- Personal Learning OS: Learning Path Persistence Schema
-- Stores AI-generated roadmaps and per-day activity completion.

-- 1. Learning Paths (one active path per user)
CREATE TABLE IF NOT EXISTS public.learning_paths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  total_days INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plan_metadata JSONB DEFAULT '{}'::jsonb,  -- stores orchestrator run context
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: only 1 active path per user (for duplicate prevention)
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_paths_user_active
  ON public.learning_paths (user_id)
  WHERE is_active = true;

-- 2. Learning Path Days (one row per day in the roadmap)
CREATE TABLE IF NOT EXISTS public.learning_path_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path_id UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_number INT NOT NULL CHECK (day_number >= 1),
  topic TEXT NOT NULL,
  learn_content TEXT NOT NULL DEFAULT '',
  practice_problems INT NOT NULL DEFAULT 3,
  review_activity TEXT NOT NULL DEFAULT '',
  ai_estimated_minutes INT NOT NULL DEFAULT 60,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  evidence_rationale TEXT,
  -- Activity-level completion: {learn: boolean, practice: boolean, review: boolean}
  activities_completed JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, day_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_user_id ON public.learning_paths(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_days_path_id ON public.learning_path_days(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_days_user_id ON public.learning_path_days(user_id);

-- Enable Row Level Security
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_days ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe re-run)
DROP POLICY IF EXISTS "Users can view their own learning paths" ON public.learning_paths;
DROP POLICY IF EXISTS "Users can insert their own learning paths" ON public.learning_paths;
DROP POLICY IF EXISTS "Users can update their own learning paths" ON public.learning_paths;
DROP POLICY IF EXISTS "Users can delete their own learning paths" ON public.learning_paths;
DROP POLICY IF EXISTS "Users can view their own learning path days" ON public.learning_path_days;
DROP POLICY IF EXISTS "Users can insert their own learning path days" ON public.learning_path_days;
DROP POLICY IF EXISTS "Users can update their own learning path days" ON public.learning_path_days;
DROP POLICY IF EXISTS "Users can delete their own learning path days" ON public.learning_path_days;

-- Strict user-isolated RLS policies
CREATE POLICY "Users can view their own learning paths"
  ON public.learning_paths FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning paths"
  ON public.learning_paths FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning paths"
  ON public.learning_paths FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own learning paths"
  ON public.learning_paths FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own learning path days"
  ON public.learning_path_days FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning path days"
  ON public.learning_path_days FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning path days"
  ON public.learning_path_days FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own learning path days"
  ON public.learning_path_days FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
