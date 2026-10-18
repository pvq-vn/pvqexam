import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const ALLOWED_EXAM_ROOT_DIRS = new Set([
  '2024.1',
  '2024.2',
  '2025.1',
  '2025.2',
  '2026.1',
  '2026.2',
  'Bổ trợ',
  'TOEIC',
]);

function isAllowedExamJsonPath(projectRoot: string, rawRelPath: string): string | null {
  if (!rawRelPath || typeof rawRelPath !== 'string') return null;
  const decoded = decodeURIComponent(rawRelPath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!decoded || decoded.includes('\0') || decoded.includes('..')) return null;
  if (!decoded.toLowerCase().endsWith('.json')) return null;

  const segments = decoded.split('/');
  if (segments.length < 2) return null;
  if (!ALLOWED_EXAM_ROOT_DIRS.has(segments[0])) return null;

  const resolved = path.resolve(projectRoot, decoded);
  const normalizedRoot = path.resolve(projectRoot);
  if (!resolved.startsWith(normalizedRoot + path.sep)) return null;

  return resolved;
}

/**
 * Development-only, strictly READ-ONLY plugin that:
 * 1. Serves fresh exam JSON files directly from disk with mtime headers so edits
 *    to exam.json on disk are reflected immediately without stale module cache.
 * 2. Broadcasts a Vite HMR event (`hust:exam-json-updated`) whenever an exam JSON
 *    file inside the protected directories is modified on disk.
 * 3. Never exposes any write/delete method or any file outside the allowed exam folders.
 */
function hustExamReadOnlyDevPlugin(): Plugin {
  const projectRoot = path.resolve(__dirname);

  return {
    name: 'hust-exam-readonly-dev-loader',
    apply: 'serve',
    configureServer(server) {
      // Broadcast custom HMR event when an exam JSON file changes on disk
      const handleFileEvent = (absFilePath: string) => {
        const rel = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');
        if (isAllowedExamJsonPath(projectRoot, rel)) {
          server.ws.send({
            type: 'custom',
            event: 'hust:exam-json-updated',
            data: {
              filePath: `/${rel}`,
              timestamp: Date.now(),
            },
          });
        }
      };

      server.watcher.on('change', handleFileEvent);
      server.watcher.on('add', handleFileEvent);

      // Strictly read-only (GET / HEAD) middleware for dev exam JSON loading
      server.middlewares.use('/__dev_exam_json', (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Method Not Allowed (Read-Only)' }));
          return;
        }

        try {
          const reqUrl = new URL(req.url || '', 'http://localhost');
          const requestedPath = reqUrl.searchParams.get('path') || '';
          const absPath = isAllowedExamJsonPath(projectRoot, requestedPath);

          if (!absPath) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: 'Truy cập bị từ chối: Đường dẫn không thuộc thư mục đề thi được phép đọc.',
              })
            );
            return;
          }

          if (!fs.existsSync(absPath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: `Không tìm thấy file đề thi trên đĩa: ${requestedPath}`,
              })
            );
            return;
          }

          const stat = fs.statSync(absPath);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('X-Exam-Mtime', String(Math.floor(stat.mtimeMs)));

          if (req.method === 'HEAD') {
            res.end();
            return;
          }

          const rawContent = fs.readFileSync(absPath, 'utf8');
          res.end(rawContent);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: `Lỗi đọc file đề thi: ${(err as Error).message}`,
            })
          );
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), hustExamReadOnlyDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lucide-react',
      'katex',
      'canvas-confetti',
      '@supabase/supabase-js',
    ],
  },
  server: {
    port: 3000,
    open: false,
    fs: {
      allow: ['.'],
    },
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/Codex/**',
        '**/Mẫu Office Tùy chỉnh/**',
        '**/*.pdf',
        '**/*.docx',
        '**/*.pptx',
        '**/*.xlsx',
        '**/*.zip',
        '**/*.rar',
      ],
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-katex': ['katex'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
