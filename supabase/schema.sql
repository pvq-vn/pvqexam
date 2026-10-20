-- ==============================================================================
-- HUST IT1 Quiz - Supabase Database Schema
-- ==============================================================================

-- 1. Table: user_question_stats
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

-- Index tra cứu nhanh tiến độ câu hỏi theo người dùng & môn học
CREATE INDEX IF NOT EXISTS idx_uqs_user_subject 
ON public.user_question_stats(user_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_uqs_user_attempts 
ON public.user_question_stats(user_id, subject_id, attempt_count);

-- Kích hoạt Row Level Security (RLS)
ALTER TABLE public.user_question_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own question stats"
ON public.user_question_stats
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. Table: quiz_attempts
-- Lưu lịch sử làm bài thi hoàn chỉnh
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id TEXT PRIMARY KEY,
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

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own attempts"
ON public.quiz_attempts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. Table: error_reports
-- Báo cáo câu hỏi có vấn đề gửi tới admin
CREATE TABLE IF NOT EXISTS public.error_reports (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  subject_id TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
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
