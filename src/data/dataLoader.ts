import { Question } from '../types/quiz';
import { normalizeExam } from '../engine/normalizer';

interface CachedExamEntry {
  questions: Question[];
  stats: ExamStats;
  mtime?: string;
  contentLength: number;
  loadedAt: number;
}

// In-memory cache of normalized questions per canonical file path
const examCache = new Map<string, CachedExamEntry>();

// Listeners notified when an exam JSON is updated in dev mode via HMR or manual invalidation
type ExamUpdateListener = (filePath?: string) => void;
const updateListeners = new Set<ExamUpdateListener>();

// Vite glob to load all JSON files across semesters as raw text strings in production builds
const rawExamModules =
  typeof (import.meta as any).glob === 'function'
    ? (import.meta as any).glob(
        ['/20*/**/Gemini/*.json', '/20*/**/Gemini/*.JSON'],
        { query: '?raw', import: 'default' }
      )
    : {};

/**
 * Normalizes a file path to a canonical leading-slash NFC form so paths with
 * Vietnamese diacritics, spaces, and case differences match reliably.
 */
export function canonicalizeExamPath(filePath: string): string {
  const trimmed = filePath.trim().replace(/\\/g, '/');
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return typeof withLeadingSlash.normalize === 'function'
    ? withLeadingSlash.normalize('NFC')
    : withLeadingSlash;
}

/**
 * Invalidates in-memory exam cache for a specific file or all files.
 */
export function invalidateExamCache(filePath?: string): void {
  if (!filePath) {
    examCache.clear();
  } else {
    const target = canonicalizeExamPath(filePath).toLowerCase();
    for (const key of Array.from(examCache.keys())) {
      if (key.toLowerCase() === target) {
        examCache.delete(key);
      }
    }
  }
  updateListeners.forEach((listener) => {
    try {
      listener(filePath);
    } catch {
      // ignore listener errors
    }
  });
}

/**
 * Subscribe to exam cache invalidation / HMR file update events.
 */
export function onExamCacheUpdated(listener: ExamUpdateListener): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

// Subscribe to Vite HMR custom event in development mode
if (import.meta.hot) {
  import.meta.hot.on(
    'hust:exam-json-updated',
    (payload: { filePath?: string; timestamp?: number }) => {
      invalidateExamCache(payload?.filePath);
    }
  );
}

/**
 * Robust in-memory JSON repairer for raw exam files in the repo.
 * NEVER modifies any file on disk.
 */
export function sanitizeExamJsonText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '');

  // 1. Quote unquoted single-line property values starting with a number followed by annotation text (e.g. "id": 40 - Xem lại,)
  text = text.replace(
    /^([ \t]*"[^"\r\n]+"[ \t]*:[ \t]*)(-?\d+(?:\.\d+)?[ \t]+[^\r\n,}\]]+?)([ \t]*[,}\]]?[ \t]*\r?)$/gm,
    (_, prefix, val, suffix) => `${prefix}${JSON.stringify(val.trim())}${suffix}`
  );

  // 2. Quote unquoted single-line property values not starting with a valid JSON value starter
  text = text.replace(
    /^([ \t]*"[^"\r\n]+"[ \t]*:[ \t]*)(?![ \t]*(?:[\[{"\-0-9]|true\b|false\b|null\b|$))([^\r\n,}\]]+?)([ \t]*[,}\]]?[ \t]*\r?)$/gm,
    (_, prefix, val, suffix) => `${prefix}${JSON.stringify(val.trim())}${suffix}`
  );

  // 3. Remove trailing commas before } or ] strictly outside of JSON string literals
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
        out += ch;
      } else if (ch === ',') {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (j < text.length && (text[j] === ']' || text[j] === '}')) {
          continue;
        }
        out += ch;
      } else {
        out += ch;
      }
    }
  }

  return out;
}

/**
 * Formats a helpful JSON parse error message including source file path and line number.
 */
function formatJsonParseError(
  filePath: string,
  rawText: string,
  err: Error
): string {
  const posMatch = err.message.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Number(posMatch[1]);
    if (!Number.isNaN(pos) && pos >= 0 && pos <= rawText.length) {
      const upToPos = rawText.slice(0, pos);
      const lines = upToPos.split('\n');
      const lineNum = lines.length;
      const colNum = lines[lines.length - 1].length + 1;
      return `Lỗi cú pháp JSON trong file "${filePath}" (dòng ${lineNum}, cột ${colNum}): ${err.message}`;
    }
  }
  return `Lỗi cú pháp JSON trong file "${filePath}": ${err.message}`;
}

export interface LoadExamOptions {
  /** Force bypassing in-memory cache and re-reading from source */
  forceReload?: boolean;
}

/**
 * Loads and normalizes an exam JSON file from its file path (strictly read-only).
 * - In development: verifies file mtime via read-only dev middleware so edits on disk
 *   are picked up immediately without stale module caches.
 * - In production: loads from Vite bundled raw module chunk or static fetch, and caches in RAM.
 */
export async function loadExamFile(
  filePath: string,
  options?: LoadExamOptions
): Promise<Question[]> {
  const normalizedPath = canonicalizeExamPath(filePath);
  const cacheKey = normalizedPath.toLowerCase();
  const forceReload = Boolean(options?.forceReload);
  const isDev = Boolean(import.meta.env?.DEV);

  const cached = examCache.get(cacheKey);

  let rawContent: string | null = null;
  let diskMtime: string | undefined;

  // 1. In development mode, try the read-only dev endpoint first to detect disk changes
  if (isDev) {
    const devEndpoint = `/__dev_exam_json?path=${encodeURIComponent(normalizedPath)}`;
    try {
      // If we already have a cached entry with an mtime and not forcing reload, do a lightweight HEAD check
      if (cached && cached.mtime && !forceReload) {
        const headRes = await fetch(`${devEndpoint}&_t=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (headRes.ok) {
          const currentMtime = headRes.headers.get('X-Exam-Mtime') || undefined;
          if (currentMtime && currentMtime === cached.mtime) {
            return cached.questions;
          }
        }
      }

      const devRes = await fetch(`${devEndpoint}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (devRes.ok) {
        const contentType = devRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          diskMtime = devRes.headers.get('X-Exam-Mtime') || undefined;
          if (
            cached &&
            !forceReload &&
            diskMtime &&
            cached.mtime === diskMtime
          ) {
            return cached.questions;
          }
          rawContent = await devRes.text();
        }
      } else if (devRes.status === 404) {
        examCache.delete(cacheKey);
        throw new Error(
          `Không tìm thấy file đề thi trên đĩa: "${normalizedPath}". Vui lòng kiểm tra lại đường dẫn file.`
        );
      }
    } catch (devErr) {
      // If it was an explicit 404 from disk, rethrow immediately
      if (
        devErr instanceof Error &&
        devErr.message.includes('Không tìm thấy file đề thi')
      ) {
        throw devErr;
      }
      // Otherwise fall through to Vite glob / standard fetch
    }
  } else if (cached && !forceReload) {
    // In production mode, return cached questions immediately
    return cached.questions;
  }

  // 2. Try matching from Vite rawExamModules (bundled chunks in production or fallback in dev)
  if (!rawContent) {
    const moduleKey = Object.keys(rawExamModules).find(
      (key) => canonicalizeExamPath(key).toLowerCase() === cacheKey
    );

    if (moduleKey && rawExamModules[moduleKey]) {
      try {
        const loader = rawExamModules[moduleKey] as () => Promise<string>;
        rawContent = await loader();
      } catch (e) {
        console.warn(
          `Failed loading raw module for ${normalizedPath}, falling back to fetch`,
          e
        );
      }
    }
  }

  // 3. Fallback to browser fetch
  if (!rawContent) {
    try {
      const encodedPath = encodeURI(normalizedPath);
      const fetchUrl = isDev
        ? `${encodedPath}${encodedPath.includes('?') ? '&' : '?'}_t=${Date.now()}`
        : encodedPath;
      const res = await fetch(fetchUrl, {
        cache: isDev ? 'no-store' : 'default',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      // Guard against SPA fallback returning index.html for a missing file
      if (
        contentType.includes('text/html') ||
        text.trim().toLowerCase().startsWith('<!doctype html')
      ) {
        throw new Error(`File không tồn tại trên hệ thống (${normalizedPath})`);
      }
      rawContent = text;
    } catch (fetchErr) {
      throw new Error(
        `Không thể tải dữ liệu đề thi từ "${normalizedPath}": ${(fetchErr as Error).message}`
      );
    }
  }

  if (!rawContent || !rawContent.trim()) {
    throw new Error(`Dữ liệu đề thi trống trong file: "${normalizedPath}"`);
  }

  // 4. Parse JSON with in-memory sanitization (never writes back to disk)
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const sanitized = sanitizeExamJsonText(rawContent);
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      throw new Error(
        formatJsonParseError(normalizedPath, sanitized, parseErr as Error)
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Cấu trúc JSON trong file "${normalizedPath}" không hợp lệ: Dữ liệu gốc phải là một mảng (Array) các câu hỏi.`
    );
  }

  // 5. Normalize to unified schema in RAM
  const questions = normalizeExam(parsed);
  const essayCount = questions.filter((q) => q.type === 'essay').length;
  const stats: ExamStats = {
    totalCount: questions.length,
    mcqCount: questions.length - essayCount,
    essayCount,
  };

  // 6. Cache and return
  examCache.set(cacheKey, {
    questions,
    stats,
    mtime: diskMtime,
    contentLength: rawContent.length,
    loadedAt: Date.now(),
  });

  return questions;
}

export interface ExamStats {
  totalCount: number;
  mcqCount: number;
  essayCount: number;
}

/**
 * Gets count statistics for an exam file (cached or loaded).
 */
export async function getExamStats(
  filePath: string,
  options?: LoadExamOptions
): Promise<ExamStats> {
  const normalizedPath = canonicalizeExamPath(filePath);
  const cacheKey = normalizedPath.toLowerCase();

  if (
    !options?.forceReload &&
    !import.meta.env?.DEV &&
    examCache.has(cacheKey)
  ) {
    return examCache.get(cacheKey)!.stats;
  }

  const questions = await loadExamFile(filePath, options);
  const cached = examCache.get(cacheKey);
  if (cached) return cached.stats;

  const essayCount = questions.filter((q) => q.type === 'essay').length;
  return {
    totalCount: questions.length,
    mcqCount: questions.length - essayCount,
    essayCount,
  };
}
