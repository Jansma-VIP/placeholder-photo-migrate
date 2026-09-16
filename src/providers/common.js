const SIZE_PATTERN = /^(\d{1,4})(?:x(\d{1,4}))?(?:\.(svg|png|jpe?g|gif|webp|avif))?$/i;
const COLOUR_PATTERN = /^([0-9a-f]{3}|[0-9a-f]{6})(?:\.(svg|png|jpe?g|gif|webp|avif))?$/i;

const VERIFIED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 8_000_000;
const MAX_TEXT_BYTES = 720;
const MAX_TEXT_CHARACTERS = 180;

export function manual(reason) {
  return {
    status: 'manual',
    confidence: 'review',
    reason,
    replacement: null,
  };
}

export function safelyDecode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

export function validateTextValue(rawValue) {
  const value = safelyDecode(rawValue);
  if (value === null) {
    return 'The text query contains malformed percent-encoding.';
  }
  if (value.includes('\0')) {
    return 'The text query contains a null byte.';
  }
  if ([...value].length > MAX_TEXT_CHARACTERS || Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
    return 'The text query exceeds Placeholder.photo compatibility limits.';
  }
  return null;
}

export function validateTextQuery(rawQuery) {
  if (rawQuery === '' || rawQuery === '?') {
    return null;
  }

  const parts = rawQuery.slice(1).split('&');
  if (parts.length !== 1) {
    return 'Only the verified text query parameter can be migrated automatically.';
  }

  const separator = parts[0].indexOf('=');
  const rawKey = separator === -1 ? parts[0] : parts[0].slice(0, separator);
  const rawValue = separator === -1 ? '' : parts[0].slice(separator + 1);
  const key = safelyDecode(rawKey);

  if (key !== 'text') {
    return 'The query string is outside the verified legacy compatibility subset.';
  }
  return validateTextValue(rawValue);
}

export function validateDimensions(width, height) {
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    return 'The dimensions exceed Placeholder.photo compatibility limits.';
  }
  return null;
}

export function candidateFragment(candidate) {
  const fragmentAt = candidate.suffix.indexOf('#');
  return fragmentAt === -1 ? '' : candidate.suffix.slice(fragmentAt);
}

export function appendQueryParameter(rawQuery, key, value) {
  const encoded = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return rawQuery === '' || rawQuery === '?' ? `?${encoded}` : `${rawQuery}&${encoded}`;
}

export function safe(replacement) {
  return {
    status: 'safe',
    confidence: 'verified',
    reason: null,
    replacement,
  };
}

function parsePath(rawPath) {
  if (!rawPath || rawPath === '/') {
    return manual('No legacy placeholder image dimensions were found in the path.');
  }
  if (rawPath.includes('%') || rawPath.includes('\\') || rawPath.includes('//')) {
    return manual('Encoded or non-canonical path separators require manual review.');
  }

  const trimmed = rawPath.replace(/^\//, '').replace(/\/$/, '');
  const segments = trimmed.split('/');
  if (segments[0]?.toLowerCase() === 'img') {
    segments.shift();
  }
  if (segments.length < 1 || segments.length > 3) {
    return manual('The path is not a verified classic placeholder pattern.');
  }

  const size = SIZE_PATTERN.exec(segments[0]);
  if (!size) {
    return manual('The dimension segment is malformed or unsupported.');
  }

  const width = Number.parseInt(size[1], 10);
  const height = size[2] ? Number.parseInt(size[2], 10) : width;
  const dimensionProblem = validateDimensions(width, height);
  if (dimensionProblem) return manual(dimensionProblem);

  const extensions = [];
  if (size[3]) extensions.push(size[3].toLowerCase());
  for (const colourSegment of segments.slice(1)) {
    const colour = COLOUR_PATTERN.exec(colourSegment);
    if (!colour) {
      return manual('A colour segment is outside the verified 3- or 6-digit hexadecimal syntax.');
    }
    if (colour[2]) extensions.push(colour[2].toLowerCase());
  }

  if (extensions.length > 1) {
    return manual('Multiple format suffixes are ambiguous and require manual review.');
  }
  if (extensions.length === 1 && !VERIFIED_FORMATS.has(extensions[0])) {
    return manual('This format is supported elsewhere by Placeholder.photo but is not in the verified legacy migration matrix.');
  }

  return null;
}

export function analyseClassicCandidate(candidate, { exactHost = true } = {}) {
  if (!exactHost) {
    return manual('This hostname variant is not covered by the verified compatibility rules.');
  }
  if (candidate.port) {
    return manual('URLs with an explicit port require manual review.');
  }

  const pathProblem = parsePath(candidate.path);
  if (pathProblem) return pathProblem;

  const queryProblem = validateTextQuery(candidate.query);
  if (queryProblem) return manual(queryProblem);

  return safe(`https://placeholder.photo${candidate.suffix}`);
}
