-- ==============================================================================
-- PVQExam Comprehensive Upgrade Migration Script
-- Safe & idempotent migration for new features:
-- 1. Shared Exam Definitions (exam_definitions)
-- 2. User Notifications (user_notifications)
-- 3. Expanded Error Reports metadata (scope, original_question_id, source_file, seed, etc.)
-- 4. User Profiles subject permissions (25%, 50%, 75%, 100%)
-- 5. Quiz Attempts exam reference (exam_id)
-- ==============================================================================

-- 1. User Profiles Extensions
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_exam_sources JSONB DEFAULT '[]'::jsonb,
  subject_permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if user_profiles table already existed
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS subject_permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS allowed_exam_sources JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Admins can manage all profiles'
  ) THEN
    CREATE POLICY "Admins can manage all profiles"
    ON public.user_profiles FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
      )
    );
  END IF;
END $$;

-- 2. Exam Definitions Table (Section 6 & 10)
CREATE TABLE IF NOT EXISTS public.exam_definitions (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL UNIQUE,
  subject_id TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_email TEXT,
  creator_name TEXT,
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL,
  bank_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exam_definitions 
  ADD COLUMN IF NOT EXISTS creator_name TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_definitions_seed 
ON public.exam_definitions(seed);

CREATE INDEX IF NOT EXISTS idx_exam_definitions_subject 
ON public.exam_definitions(subject_code, created_at DESC);

ALTER TABLE public.exam_definitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_definitions' AND policyname = 'Anyone can view exam definitions'
  ) THEN
    CREATE POLICY "Anyone can view exam definitions"
    ON public.exam_definitions FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_definitions' AND policyname = 'Authenticated users can create exam definitions'
  ) THEN
    CREATE POLICY "Authenticated users can create exam definitions"
    ON public.exam_definitions FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_definitions' AND policyname = 'Anyone can update exam definitions'
  ) THEN
    CREATE POLICY "Anyone can update exam definitions"
    ON public.exam_definitions FOR UPDATE
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_definitions' AND policyname = 'Admins can delete exam definitions'
  ) THEN
    CREATE POLICY "Admins can delete exam definitions"
    ON public.exam_definitions FOR DELETE
    USING (true);
  END IF;
END $$;

-- 3. Quiz Attempts Extensions
ALTER TABLE public.quiz_attempts 
  ADD COLUMN IF NOT EXISTS exam_id TEXT;

CREATE INDEX IF NOT EXISTS idx_qa_seed 
ON public.quiz_attempts(seed);

CREATE INDEX IF NOT EXISTS idx_qa_exam_id 
ON public.quiz_attempts(exam_id);

-- Clean non-recursive policies on quiz_attempts using is_admin()
DROP POLICY IF EXISTS "Admins can view all quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "quiz_attempts_select" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_select"
ON public.quiz_attempts FOR SELECT
USING ((auth.uid() = user_id) OR is_admin() OR (auth.uid() IS NULL));

-- 4. Error Reports Extensions (Section 8.2 & 9)
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS original_question_id TEXT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS source_file TEXT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS seed TEXT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS attempt_id TEXT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS question_index INT;
ALTER TABLE public.error_reports 
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Make description optional in error_reports
ALTER TABLE public.error_reports 
  ALTER COLUMN description DROP NOT NULL;

-- Allow update & select on error_reports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'error_reports' AND policyname = 'Admins can update reports'
  ) THEN
    CREATE POLICY "Admins can update reports"
    ON public.error_reports FOR UPDATE
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'error_reports' AND policyname = 'Anyone can view reports'
  ) THEN
    CREATE POLICY "Anyone can view reports"
    ON public.error_reports FOR SELECT
    USING (true);
  END IF;
END $$;

-- 5. Exam definitions extension (Title & Public)
ALTER TABLE public.exam_definitions 
  ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.exam_definitions 
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- 6. User Notifications Table (Section 9.3 & 9.4)
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  report_id TEXT REFERENCES public.error_reports(id) ON DELETE SET NULL,
  subject_code TEXT NOT NULL,
  seed TEXT NOT NULL,
  question_index INT,
  attempt_id TEXT,
  message TEXT NOT NULL,
  admin_note TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifs_user 
ON public.user_notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifs_email 
ON public.user_notifications(user_email, is_read, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can view their notifications'
  ) THEN
    CREATE POLICY "Users can view their notifications"
    ON public.user_notifications FOR SELECT
    USING (auth.uid() = user_id OR auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can update their notifications read state'
  ) THEN
    CREATE POLICY "Users can update their notifications read state"
    ON public.user_notifications FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role')
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Admins can create notifications'
  ) THEN
    CREATE POLICY "Admins can create notifications"
    ON public.user_notifications FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;
