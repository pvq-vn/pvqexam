export type QuestionType = 'single' | 'multiple' | 'essay' | 'dropdown' | 'fill';

export interface Option {
  id: string; // 'a', 'b', 'c', 'd' or '0', '1', '2'
  text: string;
}

export interface DropdownSlot {
  label?: string; // Optional prompt/label for this slot (e.g. 'Khách hàng:', 'Vị trí [1]')
  choices: Option[]; // Available selectable options for this slot
}

export interface Question {
  id: string | number;
  type: QuestionType;
  text: string;
  code?: string;
  table?: string;
  link?: string;
  options?: Option[];
  dropdownSlots?: DropdownSlot[];
  // For single/multiple/fill: string representations
  // For dropdown: can be string[] of correct options or indices
  correctAnswers: string[];
  explanation?: string;
  suggestion?: string;
  scope?: string;
  points?: number;
  // Raw references
  originalNum?: number;
  topic?: string;
  chapter?: number | string;
  chapter_name?: string;
  driveImageId?: string;
  imageUrl?: string;
  sourceFile?: string;
}

export type SubjectPermissionTier = 25 | 50 | 75 | 100;

export interface ChapterInfo {
  id: string; // e.g. "1", "2", "3" or name if no number
  chapter?: number | string;
  name: string;
  count: number;
  mcqCount: number;
  essayCount: number;
}

export interface QuestionStat {
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastAttemptedAt: string;
}

export interface SubjectProgress {
  totalQuestions: number;
  attemptedQuestions: number;
  neverAttemptedQuestions: number;
  totalAttempts: number;
  accuracy: number;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  semester: string;
  examFiles: {
    label: string;
    filePath: string;
    isDefault?: boolean;
  }[];
  description?: string;
  badge?: string;
}

export type TimeMode = 'auto' | 'unlimited' | '15' | '30' | '45' | '60' | 'custom';

export interface QuizConfig {
  subjectId: string;
  examFilePath: string;
  examFilePaths?: string[];
  title?: string;
  mcqCount: number;
  essayCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timeMode: TimeMode;
  customMinutes?: number;
  seed: string;
  selectedChapter?: string; // 'all' or chapter identifier (backwards compat)
  selectedChapters?: string[]; // multiple selected chapters
  examDefinitionId?: string; // stable shared exam ID if based on existing exam
  prioritizeLeastAttempted?: boolean; // Default true: prioritize questions with fewest attempts
}

export interface QuestionEvaluation {
  isCorrect: boolean;
  isUnanswered: boolean;
  earnedPoints: number;
  maxPoints: number;
  userAnswer: string | string[];
  correctAnswers: string[];
}

export interface QuizResult {
  score10: number; // Scaled to 10
  totalPossibleScore: number;
  earnedScore: number;
  totalQuestions: number;
  totalScoredQuestions: number; // MCQ, fill, dropdown
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  essayCount: number; // Unscored
  timeSpentSeconds: number;
  evaluations: Record<string | number, QuestionEvaluation>;
}

export interface QuizAttempt {
  id: string;
  userId?: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  seed: string;
  examId?: string;
  examDefinitionId?: string;
  score10: number;
  totalScoredQuestions: number;
  correctCount: number;
  unansweredCount: number;
  essayCount: number;
  timeSpentSeconds: number;
  startedAt: string;
  submittedAt: string;
  config: QuizConfig;
  questions: Question[];
  answers: Record<string | number, string | string[]>;
  flagged: (string | number)[];
  result: QuizResult;
}

export type ReportType = 
  | 'wrong_answer' 
  | 'wrong_content' 
  | 'missing_image' 
  | 'format_error' 
  | 'wrong_explanation' 
  | 'other';

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

export interface ErrorReport {
  id: string;
  userId?: string;
  userEmail?: string;
  subjectId: string;
  subjectCode: string;
  questionId: string | number;
  originalQuestionId?: string | number;
  questionText: string;
  scope?: string;
  sourceFile?: string;
  seed?: string;
  attemptId?: string;
  questionIndex?: number;
  type: ReportType;
  description?: string; // Optional as per Section 9.1
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
}

export interface ExamDefinition {
  id: string;
  seed: string;
  subjectId: string;
  subjectCode: string;
  title?: string;
  isPublic?: boolean;
  createdByUserId?: string;
  creatorEmail?: string;
  creatorName?: string;
  questionIds: (string | number)[];
  totalQuestions?: number;
  config: QuizConfig;
  bankVersion?: string;
  createdAt: string;
}

export interface UserNotification {
  id: string;
  userId?: string;
  userEmail?: string;
  reportId?: string;
  subjectCode: string;
  seed: string;
  questionIndex?: number;
  attemptId?: string;
  message: string;
  adminNote?: string;
  isRead: boolean;
  createdAt: string;
}
