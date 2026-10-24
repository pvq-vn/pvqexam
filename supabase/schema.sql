-- ==============================================================================
-- HUST IT1 Quiz - Supabase Database Schema (Complete & Upgraded)
-- ==============================================================================

-- 1. Table: user_profiles
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

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON public.user_profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
ON public.user_profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
  )
);

-- ------------------------------------------------------------------------------
-- 2. Table: user_question_stats
-- Lưu số lần làm và độ chính xác của từng câu hỏi theo từng người dùng (Spaced Repetition)
CREATE TABLE IF NOT EXISTS public.user_question_stats (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 1,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_subject_question UNIQUE(user_id, subject_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_uqs_user_subject 
ON public.user_question_stats(user_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_uqs_user_attempts 
ON public.user_question_stats(user_id, subject_id, attempt_count);

ALTER TABLE public.user_question_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own question stats"
ON public.user_question_stats
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. Table: quiz_attempts
-- Lưu lịch sử làm bài thi hoàn chỉnh
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  seed TEXT NOT NULL,
  score_10 NUMERIC(4, 2) NOT NULL,
  total_scored_questions INT NOT NULL,
  correct_count INT NOT NULL,
  unanswered_count INT NOT NULL,
  essay_count INT NOT NULL,
  time_spent_seconds INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  config JSONB NOT NULL,
  questions_snapshot JSONB NOT NULL,
  answers JSONB NOT NULL,
  flagged JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_user_submitted 
ON public.quiz_attempts(user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_seed 
ON public.quiz_attempts(seed);

CREATE INDEX IF NOT EXISTS idx_qa_exam_id 
ON public.quiz_attempts(exam_id);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own attempts"
ON public.quiz_attempts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. Table: exam_definitions (Shared Exam Definitions)
CREATE TABLE IF NOT EXISTS public.exam_definitions (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL UNIQUE,
  subject_id TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_email TEXT,
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL,
  bank_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_definitions_seed 
ON public.exam_definitions(seed);

CREATE INDEX IF NOT EXISTS idx_exam_definitions_subject 
ON public.exam_definitions(subject_code, created_at DESC);

ALTER TABLE public.exam_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exam definitions"
ON public.exam_definitions FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create exam definitions"
ON public.exam_definitions FOR INSERT
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Anyone can update exam definitions"
ON public.exam_definitions FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Admins can delete exam definitions"
ON public.exam_definitions FOR DELETE
USING (true);

-- ------------------------------------------------------------------------------
-- 5. Table: error_reports
-- Báo cáo câu hỏi có vấn đề gửi tới admin
CREATE TABLE IF NOT EXISTS public.error_reports (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  subject_id TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  question_id TEXT NOT NULL,
  original_question_id TEXT,
  scope TEXT,
  source_file TEXT,
  seed TEXT,
  attempt_id TEXT,
  question_index INT,
  question_text TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can create reports"
ON public.error_reports
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view their reports"
ON public.error_reports
FOR SELECT
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 6. Table: user_notifications
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

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
ON public.user_notifications FOR SELECT
USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their notifications read state"
ON public.user_notifications FOR UPDATE
USING (auth.uid() = user_id OR auth.role() = 'service_role')
WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Admins can create notifications"
ON public.user_notifications FOR INSERT
WITH CHECK (true);
