import {
  appendQueryParameter,
  candidateFragment,
  manual,
  safe,
  validateDimensions,
  validateTextQuery,
} from './common.js';

const SIZE_PATTERN = /^(\d{1,4})x(\d{1,4})\.(png|jpe?g)$/i;
const COLOUR_PATTERN = /^[0-9a-f]{6}$/i;

function analyse(candidate) {
  if (candidate.hostname !== 'placehold.jp') {
    return manual('This hostname variant is not covered by the verified Placehold.jp rules.');
  }
  if (candidate.port) return manual('URLs with an explicit port require manual review.');
  const segments = candidate.path.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (segments.length < 1 || segments.length > 4) {
    return manual('This Placehold.jp path form requires manual review.');
  }

  const size = SIZE_PATTERN.exec(segments.at(-1));
  if (!size) return manual('Placehold.jp automatic migration requires an explicit PNG or JPEG numeric size.');
  const width = Number.parseInt(size[1], 10);
  const height = Number.parseInt(size[2], 10);
  const dimensionProblem = validateDimensions(width, height);
  if (dimensionProblem) return manual(dimensionProblem);
  const queryProblem = validateTextQuery(candidate.query);
  if (queryProblem) return manual(queryProblem);

  const target = [`${size[1]}x${size[2]}`];
  let fontSize = null;
  if (segments.length === 1) {
    target.push('CCCCCC', '999999');
  } else if (segments.length === 2) {
    if (!COLOUR_PATTERN.test(segments[0])) {
      return manual('Only documented 6-digit Placehold.jp foreground colours migrate automatically.');
    }
    target.push('CCCCCC', segments[0]);
  } else if (segments.length === 3) {
    if (!COLOUR_PATTERN.test(segments[0]) || !COLOUR_PATTERN.test(segments[1])) {
      return manual('Only documented 6-digit Placehold.jp background and foreground colours migrate automatically.');
    }
    target.push(segments[0], segments[1]);
  } else {
    if (!/^\d{1,3}$/.test(segments[0]) || Number(segments[0]) < 1 || Number(segments[0]) > 512) {
      return manual('The Placehold.jp font size is outside Placeholder.photo compatibility limits.');
    }
    if (!COLOUR_PATTERN.test(segments[1]) || !COLOUR_PATTERN.test(segments[2])) {
      return manual('Only documented 6-digit Placehold.jp colours migrate automatically.');
    }
    fontSize = segments[0];
    target.push(segments[1], segments[2]);
  }
  target[target.length - 1] = `${target.at(-1)}.${size[3].toLowerCase()}`;
  const query = fontSize === null ? candidate.query : appendQueryParameter(candidate.query, 'fontSize', fontSize);
  return safe(`https://placeholder.photo/${target.join('/')}${query}${candidateFragment(candidate)}`);
}

export const placeholdJpProvider = {
  id: 'placehold-jp',
  label: 'placehold.jp',
  hosts: new Set(['placehold.jp', 'www.placehold.jp']),
  analyse,
};
