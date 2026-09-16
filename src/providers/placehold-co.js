import {
  appendQueryParameter,
  candidateFragment,
  manual,
  safe,
  validateDimensions,
  validateTextQuery,
} from './common.js';

const SIZE_PATTERN = /^(\d{1,4})(?:x(\d{1,4}))?(?:@([23])x)?(?:\.(svg|png|jpe?g|gif|webp|avif))?$/i;
const COLOUR_PATTERN = /^([0-9a-f]{3}|[0-9a-f]{6})(?:\.(svg|png|jpe?g|gif|webp|avif))?$/i;
const FORMAT_PATTERN = /^(svg|png|jpe?g|gif|webp|avif)$/i;

function analyse(candidate) {
  if (candidate.hostname !== 'placehold.co') {
    return manual('This hostname variant is not covered by the verified Placehold.co rules.');
  }
  if (candidate.port) return manual('URLs with an explicit port require manual review.');

  const trimmed = candidate.path.replace(/^\//, '').replace(/\/$/, '');
  const segments = trimmed.split('/');
  let pathFormat = null;
  if (segments.length > 1 && FORMAT_PATTERN.test(segments.at(-1))) {
    pathFormat = segments.pop().toLowerCase();
  }
  if (segments.length !== 1 && segments.length !== 3) {
    return manual('Placehold.co colours must be a verified background/text pair; retina and other path forms require review.');
  }

  const size = SIZE_PATTERN.exec(segments[0]);
  if (!size) return manual('The Placehold.co dimension segment is malformed or unsupported.');
  const width = Number.parseInt(size[1], 10);
  const height = size[2] ? Number.parseInt(size[2], 10) : width;
  const dpr = size[3] ? Number.parseInt(size[3], 10) : 1;
  const dimensionProblem = validateDimensions(width, height);
  if (dimensionProblem) return manual(dimensionProblem);
  if (width < 10 || height < 10 || width > 4000 || height > 4000) {
    return manual('The dimensions are outside Placehold.co’s documented live range.');
  }
  if (width * height * dpr * dpr > 8_000_000) {
    return manual('The retina dimensions exceed Placeholder.photo rendering limits.');
  }

  const clean = [segments[0].replace(/@(?:2|3)x/i, '').replace(/\.(svg|png|jpe?g|gif|webp|avif)$/i, '')];
  const formats = [size[4], pathFormat].filter(Boolean).map((value) => value.toLowerCase());
  if (segments.length === 3) {
    const background = COLOUR_PATTERN.exec(segments[1]);
    const foreground = COLOUR_PATTERN.exec(segments[2]);
    if (!background || !foreground) {
      return manual('CSS colour names, transparency, and non-hex Placehold.co colours require manual review.');
    }
    clean.push(background[1], foreground[1]);
    if (background[2]) formats.push(background[2].toLowerCase());
    if (foreground[2]) formats.push(foreground[2].toLowerCase());
  } else {
    // Placehold.co's live defaults differ from Placeholder.photo's defaults.
    clean.push('DDDDDD', '999999');
  }
  if (formats.length > 1) return manual('Multiple Placehold.co format declarations are ambiguous.');

  const queryProblem = validateTextQuery(candidate.query);
  if (queryProblem) return manual(queryProblem);
  const format = formats[0] ?? 'svg';
  if (dpr > 1 && format === 'svg') return manual('Placehold.co retina SVG has no verified equivalent.');
  clean[clean.length - 1] = `${clean.at(-1)}.${format}`;
  const query = dpr > 1 ? appendQueryParameter(candidate.query, 'dpr', String(dpr)) : candidate.query;
  return safe(`https://placeholder.photo/${clean.join('/')}${query}${candidateFragment(candidate)}`);
}

export const placeholdCoProvider = {
  id: 'placehold-co',
  label: 'placehold.co',
  hosts: new Set(['placehold.co', 'www.placehold.co']),
  analyse,
};
