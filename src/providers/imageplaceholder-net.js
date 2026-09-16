import { candidateFragment, manual, safe, validateDimensions, validateTextQuery } from './common.js';

const SIZE_PATTERN = /^(\d{1,4})(?:x(\d{1,4}))?$/;
const COLOUR_PATTERN = /^[0-9a-f]{6}$/i;

function analyse(candidate) {
  if (candidate.hostname !== 'imageplaceholder.net') {
    return manual('This hostname variant is not covered by the verified ImagePlaceholder.net rules.');
  }
  if (candidate.port) return manual('URLs with an explicit port require manual review.');
  const segments = candidate.path.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (segments.length < 1 || segments.length > 3) {
    return manual('This ImagePlaceholder.net path is outside the documented size and colour syntax.');
  }
  const size = SIZE_PATTERN.exec(segments[0]);
  if (!size) return manual('The ImagePlaceholder.net dimension segment is malformed or unsupported.');
  const width = Number(size[1]);
  const height = size[2] ? Number(size[2]) : width;
  const dimensionProblem = validateDimensions(width, height);
  if (dimensionProblem) return manual(dimensionProblem);
  const queryProblem = validateTextQuery(candidate.query);
  if (queryProblem) return manual(queryProblem);

  if (segments.slice(1).some((colour) => !COLOUR_PATTERN.test(colour))) {
    return manual('Only documented 6-digit ImagePlaceholder.net colours migrate automatically.');
  }
  const target = [size[2] ? `${width}x${height}` : String(width), ...segments.slice(1)];
  if (target.length === 1) target.push('EEEEEE', '313131');
  else if (target.length === 2) target.push('313131');
  target[target.length - 1] = `${target.at(-1)}.png`;
  return safe(`https://placeholder.photo/${target.join('/')}${candidate.query}${candidateFragment(candidate)}`);
}

export const imageplaceholderNetProvider = {
  id: 'imageplaceholder-net',
  label: 'imageplaceholder.net',
  hosts: new Set(['imageplaceholder.net', 'www.imageplaceholder.net']),
  analyse,
};
