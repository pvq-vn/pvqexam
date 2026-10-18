import React, { useState, useMemo, useEffect } from 'react';
import {
  ExternalLink,
  AlertCircle,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import {
  extractDriveFileId,
  resolveImageSource,
  sanitizeUrlToken,
  ResolvedImageSource,
} from '../utils/driveImage';
import {
  tokenizeBlocks,
  tokenizeInline,
  renderLatexToHtml,
  InlineToken,
} from '../utils/mathParser';
import { parseTableData, StructuredTable } from '../utils/tableParser';

export interface RichTextProps {
  text?: string;
  code?: string;
  table?: unknown;
  link?: string;
  driveImageId?: string;
  className?: string;
  /** Compact inline mode for MCQ options or table cells */
  compact?: boolean;
}

export const RichTextRenderer: React.FC<RichTextProps> = React.memo(
  ({
    text = '',
    code,
    table,
    link,
    driveImageId,
    className = '',
    compact = false,
  }) => {
    // Resolve standalone attachment (link / driveImageId)
    const primaryMedia = useMemo(
      () => resolveImageSource(link, driveImageId),
      [link, driveImageId]
    );

    // Check if the primary media Drive ID or URL is already embedded inline inside `text`
    // so we don't render the exact same image twice.
    const isMediaInlinedInText = useMemo(() => {
      if (!primaryMedia || !text) return false;
      if (primaryMedia.driveFileId && text.includes(primaryMedia.driveFileId)) {
        return true;
      }
      if (primaryMedia.cleanUrl && text.includes(primaryMedia.cleanUrl)) {
        return true;
      }
      return false;
    }, [primaryMedia, text]);

    const parsedTables = useMemo(() => parseTableData(table), [table]);

    return (
      <div
        className={`rich-text ${compact ? 'space-y-1.5' : 'space-y-3'} text-slate-800 break-words ${className}`}
      >
        {/* 1. Main Text with LaTeX, Markdown, inline HTML, and inline media */}
        {text && <ParsedTextContent content={text} compact={compact} />}

        {/* 2. Standalone Table(s) */}
        {parsedTables.length > 0 && (
          <StructuredTablesList tables={parsedTables} />
        )}

        {/* 3. Standalone Code Block */}
        {code && <CodeBlockView code={code} />}

        {/* 4. Standalone Image / Google Drive Media (if not already inlined in text) */}
        {primaryMedia && !isMediaInlinedInText && (
          <SmartMediaRenderer source={primaryMedia} compact={compact} />
        )}
      </div>
    );
  }
);

/**
 * Renders block-level tokens from text content.
 */
const ParsedTextContent: React.FC<{ content: string; compact?: boolean }> = ({
  content,
  compact = false,
}) => {
  const blocks = useMemo(() => tokenizeBlocks(content), [content]);

  return (
    <div className={compact ? 'leading-relaxed' : 'leading-relaxed space-y-2'}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <CodeBlockView
              key={bIdx}
              code={block.content}
              language={block.language}
            />
          );
        }

        if (block.type === 'math-block') {
          return <MathSpan key={bIdx} latex={block.latex} displayMode={true} />;
        }

        if (block.type === 'table') {
          const inlineTables = parseTableData(block.content);
          return <StructuredTablesList key={bIdx} tables={inlineTables} />;
        }

        return (
          <div key={bIdx} className="space-y-1.5">
            {block.lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return null;

              const isBullet = /^[-•*]\s+/.test(trimmed);
              const cleanLine = isBullet
                ? trimmed.replace(/^[-•*]\s+/, '')
                : line;
              const tokens = tokenizeInline(cleanLine);

              if (isBullet) {
                return (
                  <div
                    key={lIdx}
                    className="flex items-start gap-2 pl-1 text-slate-800"
                  >
                    <span className="text-blue-600 font-bold select-none mt-0.5">
                      •
                    </span>
                    <div className="flex-1 min-w-0">
                      <InlineTokensView tokens={tokens} compact={compact} />
                    </div>
                  </div>
                );
              }

              return (
                <div key={lIdx} className="text-slate-800">
                  <InlineTokensView tokens={tokens} compact={compact} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Renders inline tokens (text, inline math, inline code, bold/underline/italic, URLs, dropdown badges).
 */
const InlineTokensView: React.FC<{
  tokens: InlineToken[];
  compact?: boolean;
}> = ({ tokens, compact = false }) => {
  return (
    <>
      {tokens.map((tok, idx) => {
        switch (tok.type) {
          case 'text':
            return <React.Fragment key={idx}>{tok.content}</React.Fragment>;

          case 'code':
            return (
              <code
                key={idx}
                className="px-1.5 py-0.5 mx-0.5 bg-slate-100 text-rose-700 rounded text-[0.875em] font-mono border border-slate-200/90 break-all"
              >
                {tok.content}
              </code>
            );

          case 'math-inline':
            return (
              <MathSpan
                key={idx}
                latex={tok.latex}
                displayMode={tok.displayMode}
              />
            );

          case 'bold':
            return (
              <strong key={idx} className="font-bold text-slate-900">
                <InlineTokensView tokens={tok.children} compact={compact} />
              </strong>
            );

          case 'underline':
            return (
              <u
                key={idx}
                className="underline decoration-slate-500 underline-offset-2"
              >
                <InlineTokensView tokens={tok.children} compact={compact} />
              </u>
            );

          case 'bold-underline':
            return (
              <strong
                key={idx}
                className="font-bold text-slate-900 underline decoration-slate-700 underline-offset-2"
              >
                <InlineTokensView tokens={tok.children} compact={compact} />
              </strong>
            );

          case 'italic':
            return (
              <em key={idx} className="italic text-slate-800">
                <InlineTokensView tokens={tok.children} compact={compact} />
              </em>
            );

          case 'sub':
            return <sub key={idx}>{tok.content}</sub>;

          case 'sup':
            return <sup key={idx}>{tok.content}</sup>;

          case 'slot-badge':
            return (
              <span
                key={idx}
                className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-xs font-mono font-bold bg-teal-50 text-teal-800 border border-teal-300 rounded shadow-2xs"
              >
                [{tok.slotNumber}]
              </span>
            );

          case 'url': {
            const { cleanUrl, leadingText, trailingText } = sanitizeUrlToken(
              tok.rawToken
            );
            const mediaSource = resolveImageSource(cleanUrl);

            if (
              mediaSource &&
              (mediaSource.kind.startsWith('drive-') ||
                mediaSource.kind === 'direct-image')
            ) {
              return (
                <React.Fragment key={idx}>
                  {leadingText}
                  <span
                    className="block my-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SmartMediaRenderer
                      source={mediaSource}
                      compact={compact}
                    />
                  </span>
                  {trailingText}
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={idx}>
                {leadingText}
                <a
                  href={cleanUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:text-blue-700 hover:underline break-all inline-flex items-center gap-0.5 font-medium"
                >
                  <span>{cleanUrl}</span>
                  <ExternalLink size={12} className="inline shrink-0" />
                </a>
                {trailingText}
              </React.Fragment>
            );
          }
        }
      })}
    </>
  );
};

/**
 * KaTeX Math Renderer with overflow protection on small screens and safe error fallback.
 */
const MathSpan: React.FC<{ latex: string; displayMode: boolean }> = ({
  latex,
  displayMode,
}) => {
  const { html, hasError } = useMemo(
    () => renderLatexToHtml(latex, displayMode),
    [latex, displayMode]
  );

  if (hasError || !html) {
    return (
      <code className="px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded font-mono text-xs">
        {displayMode ? `$$${latex}$$` : `$${latex}$`}
      </code>
    );
  }

  if (displayMode) {
    return (
      <div
        className="my-2.5 py-2 px-3 bg-slate-50/80 border border-slate-200/70 rounded-xl overflow-x-auto custom-scrollbar text-center"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className="inline-block align-middle max-w-full overflow-x-auto mx-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * Code block component with language tag and copy button.
 */
const CodeBlockView: React.FC<{ code: string; language?: string }> = ({
  code,
  language,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 overflow-hidden shadow-xs">
      <div className="px-3.5 py-1.5 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="uppercase tracking-wider font-semibold">
          {language || 'CODE'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-700 text-slate-300 transition-colors"
          title="Sao chép đoạn mã"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Đã chép</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Chép mã</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto custom-scrollbar text-xs sm:text-sm font-mono leading-relaxed text-emerald-300">
        <pre className="m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

/**
 * Renders one or more structured tables (supports relational schemas, matrices, multi-tables, markdown tables).
 */
const StructuredTablesList: React.FC<{ tables: StructuredTable[] }> = ({
  tables,
}) => {
  if (tables.length === 0) return null;

  const isMultiCompact =
    tables.length > 1 &&
    tables.every((t) => (t.headers?.length || t.rows[0]?.length || 0) <= 5);

  return (
    <div
      className={`my-3 ${
        isMultiCompact
          ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 items-start'
          : 'space-y-3'
      }`}
    >
      {tables.map((tbl, idx) => {
        if (tbl.externalUrl) {
          const media = resolveImageSource(tbl.externalUrl);
          if (
            media &&
            (media.kind.startsWith('drive-') || media.kind === 'direct-image')
          ) {
            return <SmartMediaRenderer key={idx} source={media} />;
          }
          return (
            <div
              key={idx}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between"
            >
              <span className="font-semibold text-slate-700">
                {tbl.title || 'Bảng dữ liệu đính kèm:'}
              </span>
              <a
                href={tbl.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
              >
                <ExternalLink size={12} /> Xem bảng
              </a>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className="overflow-x-auto custom-scrollbar rounded-xl border border-slate-200 bg-white shadow-2xs"
          >
            {tbl.title && (
              <div className="px-3.5 py-2 bg-slate-100/90 border-b border-slate-200 text-xs font-bold text-slate-800 tracking-wide">
                <InlineTokensView tokens={tokenizeInline(tbl.title)} compact />
              </div>
            )}
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              {tbl.headers && tbl.headers.length > 0 && (
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-900 font-bold">
                    {tbl.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-3.5 py-2.5 border-r last:border-r-0 border-slate-200/70 whitespace-nowrap"
                      >
                        <InlineTokensView tokens={tokenizeInline(h)} compact />
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {tbl.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-b last:border-b-0 border-slate-100 even:bg-slate-50/50 hover:bg-blue-50/30 transition-colors"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2 border-r last:border-r-0 border-slate-100 text-slate-700 ${
                          tbl.isMatrix
                            ? 'text-center font-mono'
                            : 'whitespace-normal'
                        }`}
                      >
                        <InlineTokensView
                          tokens={tokenizeInline(cell)}
                          compact
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Smart Google Drive & Direct Image Renderer:
 * - Loads direct high-res image first (zero black bars, natural aspect ratio, lazy loaded).
 * - Automatically steps through fallback endpoints if one fails.
 * - Provides click-to-zoom Lightbox modal with zoom & rotate controls.
 * - Falls back cleanly to optional preview / external link if file is not an image or restricted.
 */
const SmartMediaRenderer: React.FC<{
  source: ResolvedImageSource;
  compact?: boolean;
}> = ({ source, compact = false }) => {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [allImagesFailed, setAllImagesFailed] = useState(
    source.imageCandidates.length === 0
  );
  const [showIframePreview, setShowIframePreview] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Reset state if source changes
  useEffect(() => {
    setCandidateIndex(0);
    setIsLoaded(false);
    setAllImagesFailed(source.imageCandidates.length === 0);
    setShowIframePreview(false);
    setLightboxOpen(false);
  }, [source.cleanUrl, source.driveFileId]);

  const currentImgUrl = source.imageCandidates[candidateIndex];

  const handleImageError = () => {
    if (candidateIndex + 1 < source.imageCandidates.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setAllImagesFailed(true);
    }
  };

  if (source.kind === 'external-link') {
    return (
      <div className="my-2">
        <a
          href={source.externalViewUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 text-xs font-semibold transition-colors"
        >
          <ExternalLink size={13} />
          <span className="truncate max-w-xs sm:max-w-md">
            {source.externalViewUrl}
          </span>
        </a>
      </div>
    );
  }

  // Fallback state when direct image loading fails (e.g., PDF document or restricted Drive file)
  if (allImagesFailed) {
    return (
      <div
        className="my-2.5 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {showIframePreview && source.previewUrl ? (
          <div className="relative w-full h-80 sm:h-96 bg-slate-100">
            <iframe
              src={source.previewUrl}
              className="w-full h-full border-0"
              title="Xem trước tài liệu Google Drive"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <AlertCircle size={15} className="text-amber-500 shrink-0" />
            <span>
              {source.driveFileId
                ? 'Hình ảnh / Tài liệu đính kèm trên Google Drive'
                : 'Không thể tải ảnh trực tiếp từ nguồn'}
            </span>
          </span>

          <div className="flex items-center gap-2">
            {source.previewUrl && (
              <button
                type="button"
                onClick={() => setShowIframePreview((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold transition-colors"
              >
                <Eye size={12} />
                <span>{showIframePreview ? 'Ẩn khung xem' : 'Xem nhúng'}</span>
              </button>
            )}
            <a
              href={source.externalViewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              <ExternalLink size={12} /> Mở ảnh gốc
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <figure
        className={`my-2.5 relative rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs group ${
          compact ? 'max-w-sm' : 'w-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading Skeleton */}
        {!isLoaded && (
          <div className="w-full h-44 sm:h-56 bg-slate-100 animate-pulse flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
            <ImageIcon size={24} className=" opacity-60" />
            <span>Đang tải hình minh họa...</span>
          </div>
        )}

        {/* Responsive Image Container — Natural Aspect Ratio, Zero Black Bars */}
        <div
          onClick={() => setLightboxOpen(true)}
          className={`relative flex items-center justify-center bg-slate-50/50 cursor-zoom-in p-2 sm:p-3 ${
            !isLoaded ? 'sr-only' : ''
          }`}
        >
          <img
            src={currentImgUrl}
            alt="Hình minh họa câu hỏi"
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={handleImageError}
            className={`w-auto max-w-full ${
              compact
                ? 'max-h-48 sm:max-h-56'
                : 'max-h-[340px] sm:max-h-[440px]'
            } object-contain rounded-lg transition-transform duration-200`}
          />
        </div>

        {/* Bottom Caption & Quick Actions */}
        {isLoaded && (
          <figcaption className="px-3 py-1.5 bg-slate-50/90 border-t border-slate-200/80 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium transition-colors"
            >
              <ZoomIn size={13} />
              <span>Nhấn vào ảnh để phóng to chi tiết</span>
            </button>

            <a
              href={source.externalViewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline font-semibold shrink-0"
            >
              <ExternalLink size={11} />
              <span>Mở gốc</span>
            </a>
          </figcaption>
        )}
      </figure>

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <ImageLightboxModal
          imageUrl={currentImgUrl}
          externalUrl={source.externalViewUrl}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};

/**
 * Accessible Lightbox Modal for inspecting exam diagrams, formulas, and tables in detail.
 */
const ImageLightboxModal: React.FC<{
  imageUrl: string;
  externalUrl: string;
  onClose: () => void;
}> = ({ imageUrl, externalUrl, onClose }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=')
        setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)));
      if (e.key === '-')
        setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex flex-col overscroll-contain animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Xem chi tiết hình ảnh câu hỏi"
    >
      {/* Top Toolbar */}
      <div
        className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-200">
          <ImageIcon size={16} className="text-blue-400" />
          <span>Chi tiết hình minh họa</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Thu nhỏ (-)"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 transition-colors"
            title="Đặt lại kích thước (100%)"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Phóng to (+)"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Xoay 90°"
          >
            <RotateCw size={16} />
          </button>
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
          >
            <ExternalLink size={13} /> Mở tab mới
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white transition-colors ml-1"
            title="Đóng (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable / Zoomable Image Viewport */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-8">
        <img
          src={imageUrl}
          alt="Hình minh họa phóng to"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
          className="max-w-full max-h-[82vh] object-contain rounded-lg bg-white p-2 shadow-2xl transition-transform duration-150"
        />
      </div>
    </div>
  );
};
