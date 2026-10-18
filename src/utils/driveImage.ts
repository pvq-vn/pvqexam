/**
 * Pure utilities for classifying, sanitizing, and resolving Google Drive
 * and direct image URLs without mutating any source JSON files.
 */

export type ImageSourceKind =
  | 'drive-file'
  | 'drive-thumbnail'
  | 'drive-uc'
  | 'direct-image'
  | 'external-link'
  | 'invalid';

export interface ResolvedImageSource {
  kind: ImageSourceKind;
  originalUrl: string;
  cleanUrl: string;
  driveFileId: string | null;
  /** Ordered list of direct <img> candidate URLs to try before falling back */
  imageCandidates: string[];
  /** Embeddable preview URL (used only if all direct <img> candidates fail) */
  previewUrl: string | null;
  /** External view URL for opening in a new browser tab */
  externalViewUrl: string;
}

/**
 * Strips wrapping quotes and trailing sentence punctuation that often appear
 * when URLs are embedded inline in Vietnamese question text, e.g.:
 * `'https://drive.google.com/file/d/.../view?usp=sharing'.`
 */
export function sanitizeUrlToken(rawUrl?: string | null): {
  cleanUrl: string;
  leadingText: string;
  trailingText: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { cleanUrl: '', leadingText: '', trailingText: '' };
  }

  let working = rawUrl.trim();
  let leadingText = '';
  let trailingText = '';

  // Strip leading quotes or opening parens/brackets
  const leadMatch = working.match(/^(['"([\u2018\u201C]+)/);
  if (leadMatch) {
    leadingText = leadMatch[1];
    working = working.slice(leadingText.length);
  }

  // Strip trailing quotes, periods, commas, semicolons, colons, closing parens
  const trailMatch = working.match(/(['").,;:!?\u2019\u201D\]]+)$/);
  if (trailMatch) {
    trailingText = trailMatch[1];
    working = working.slice(0, working.length - trailingText.length);
  }

  return { cleanUrl: working, leadingText, trailingText };
}

/**
 * Extracts a Google Drive file ID from a raw ID or various Google Drive URL formats:
 * - https://drive.google.com/file/d/{id}/view
 * - https://drive.google.com/file/d/{id}/preview
 * - https://drive.google.com/open?id={id}
 * - https://drive.google.com/uc?export=view&id={id}
 * - https://drive.google.com/thumbnail?id={id}
 * - https://lh3.googleusercontent.com/d/{id}
 * - Raw Drive ID string (25-50 alphanumeric/dash/underscore characters)
 */
export function extractDriveFileId(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const { cleanUrl } = sanitizeUrlToken(input);
  if (!cleanUrl) return null;

  // 1. /file/d/{id} or /d/{id}
  const fileDMatch = cleanUrl.match(
    /(?:drive\.google\.com\/file\/d\/|googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{15,})/
  );
  if (fileDMatch) return fileDMatch[1];

  // 2. ?id={id} or &id={id}
  const queryIdMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (queryIdMatch) return queryIdMatch[1];

  // 3. Raw Drive ID (no slashes, no spaces, typical length 25..60)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(cleanUrl) && !cleanUrl.startsWith('http')) {
    return cleanUrl;
  }

  return null;
}

/**
 * Checks whether a non-Drive URL points to a direct image file.
 */
export function isDirectImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const { cleanUrl } = sanitizeUrlToken(url);
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return false;
  if (extractDriveFileId(cleanUrl)) return false;

  return (
    /\.(jpeg|jpg|gif|png|svg|webp|bmp|avif)($|[?#])/i.test(cleanUrl) ||
    /\/images?\//i.test(cleanUrl) ||
    /imgur\.com|ibb\.co|cloudinary\.com|unsplash\.com|githubusercontent\.com/i.test(cleanUrl)
  );
}

/**
 * Builds an ordered list of direct image URLs for a Google Drive file ID.
 * - Primary: Google Drive high-resolution thumbnail endpoint (w1600), which
 *   returns direct image/png or image/jpeg without iframe chrome or black bars.
 * - Secondary: Google User Content CDN (`lh3.googleusercontent.com/d/{id}=w1600`).
 * - Tertiary: Google Drive `uc?export=view&id={id}`.
 */
export function buildDriveImageCandidates(driveFileId: string): string[] {
  const id = driveFileId.trim();
  if (!id) return [];
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    `https://lh3.googleusercontent.com/d/${id}=w1600`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ];
}

/**
 * Classifies and resolves any image/Drive reference (`link`, `imageUrl`, `driveImageId`)
 * into a structured descriptor with fallback candidates.
 */
export function resolveImageSource(
  linkOrUrl?: string | null,
  explicitDriveId?: string | null
): ResolvedImageSource | null {
  const driveId = explicitDriveId
    ? extractDriveFileId(explicitDriveId) || explicitDriveId.trim()
    : extractDriveFileId(linkOrUrl);

  const { cleanUrl } = sanitizeUrlToken(linkOrUrl);

  if (driveId) {
    let kind: ImageSourceKind = 'drive-file';
    if (cleanUrl.includes('thumbnail?')) kind = 'drive-thumbnail';
    else if (cleanUrl.includes('/uc?')) kind = 'drive-uc';

    return {
      kind,
      originalUrl: linkOrUrl || driveId,
      cleanUrl: cleanUrl || `https://drive.google.com/file/d/${driveId}/view?usp=sharing`,
      driveFileId: driveId,
      imageCandidates: buildDriveImageCandidates(driveId),
      previewUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      externalViewUrl: `https://drive.google.com/file/d/${driveId}/view?usp=sharing`,
    };
  }

  if (!cleanUrl) return null;

  if (isDirectImageUrl(cleanUrl)) {
    return {
      kind: 'direct-image',
      originalUrl: linkOrUrl || cleanUrl,
      cleanUrl,
      driveFileId: null,
      imageCandidates: [cleanUrl],
      previewUrl: null,
      externalViewUrl: cleanUrl,
    };
  }

  if (/^https?:\/\//i.test(cleanUrl)) {
    return {
      kind: 'external-link',
      originalUrl: linkOrUrl || cleanUrl,
      cleanUrl,
      driveFileId: null,
      imageCandidates: [],
      previewUrl: null,
      externalViewUrl: cleanUrl,
    };
  }

  return null;
}
