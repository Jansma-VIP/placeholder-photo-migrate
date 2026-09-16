import {
  candidateFragment,
  manual,
  safe,
  validateDimensions,
  validateTextValue,
} from './common.js';

const FORMAT_SUFFIX = /\.(gif|jpe?g|png)$/i;
const COLOUR_PATTERN = /^([0-9a-f]{1,3}|[0-9a-f]{6})(?:\.(gif|jpe?g|png))?$/i;
const NAMED_SIZES = new Map(Object.entries({
  mediumrectangle: [300, 250], medrect: [300, 250], squarepopup: [250, 250], sqrpop: [250, 250],
  verticalrectangle: [240, 400], vertrec: [240, 400], largerectangle: [336, 280], lrgrec: [336, 280],
  rectangle: [180, 150], rec: [180, 150], popunder: [720, 300], pop: [720, 300],
  fullbanner: [468, 60], fullban: [468, 60], halfbanner: [234, 60], halfban: [234, 60],
  microbar: [88, 31], mibar: [88, 31], button1: [120, 90], but1: [120, 90],
  button2: [120, 60], but2: [120, 60], verticalbanner: [120, 240], vertban: [120, 240],
  squarebutton: [125, 125], sqrbut: [125, 125], leaderboard: [728, 90], leadbrd: [728, 90],
  wideskyscraper: [160, 600], wiskyscrpr: [160, 600], skyscraper: [120, 600], skyscrpr: [120, 600],
  halfpage: [300, 600], hpge: [300, 600], cga: [320, 200], qvga: [320, 240], vga: [640, 480],
  wvga: [800, 480], svga: [800, 480], wsvga: [1024, 600], xga: [1024, 768], wxga: [1280, 800],
  wsxga: [1440, 900], wuxga: [1920, 1200], wqxga: [2560, 1600], ntsc: [720, 480],
  pal: [768, 576], hd720: [1280, 720], hd1080: [1920, 1080],
}));

function parseSize(rawSegment) {
  const formatMatch = FORMAT_SUFFIX.exec(rawSegment);
  const format = formatMatch?.[1].toLowerCase() ?? null;
  const rawSize = formatMatch ? rawSegment.slice(0, -formatMatch[0].length) : rawSegment;
  const named = NAMED_SIZES.get(rawSize.toLowerCase());
  if (named) return { width: named[0], height: named[1], format };
  let match = /^(\d{1,4})(?:x(\d{1,4}))?$/.exec(rawSize);
  if (match) {
    const width = Number.parseInt(match[1], 10);
    return { width, height: match[2] ? Number.parseInt(match[2], 10) : width, format };
  }
  match = /^(\d{1,4})x(\d{1,4}):(\d{1,4})$/.exec(rawSize);
  if (match && Number(match[2]) > 0) {
    return { width: Number(match[1]), height: Math.floor(Number(match[1]) * Number(match[3]) / Number(match[2])), format };
  }
  match = /^(\d{1,4}):(\d{1,4})x(\d{1,4})$/.exec(rawSize);
  if (match && Number(match[2]) > 0) {
    return { width: Math.floor(Number(match[3]) * Number(match[1]) / Number(match[2])), height: Number(match[3]), format };
  }
  return null;
}

function expandColour(value) {
  if (value.length === 1) return value.repeat(6);
  if (value.length === 2) return value.repeat(3);
  if (value.length === 3) return [...value].map((character) => character.repeat(2)).join('');
  return value;
}

function analyse(candidate) {
  if (candidate.hostname !== 'dummyimage.com') {
    return manual('This hostname variant is not covered by the verified DummyImage rules.');
  }
  if (candidate.port) return manual('URLs with an explicit port require manual review.');
  if (candidate.query) {
    return manual('DummyImage automatic migration uses its documented &text= syntax; other query forms require review.');
  }

  let rawPath = candidate.path;
  let targetQuery = '';
  const ampersandAt = rawPath.indexOf('&');
  if (ampersandAt !== -1) {
    const textPart = rawPath.slice(ampersandAt);
    rawPath = rawPath.slice(0, ampersandAt);
    if (!textPart.startsWith('&text=') || textPart.slice(6).includes('&')) {
      return manual('Only DummyImage’s documented single &text= option can be migrated automatically.');
    }
    const rawValue = textPart.slice(6);
    const textProblem = validateTextValue(rawValue);
    if (textProblem) return manual(textProblem);
    targetQuery = `?text=${rawValue}`;
  }

  const segments = rawPath.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (segments.length < 1 || segments.length > 3) {
    return manual('Ratios, named sizes, and other DummyImage path forms require manual review.');
  }
  const size = parseSize(segments[0]);
  if (!size) return manual('The DummyImage size is not a verified numeric dimension pattern.');
  const { width, height } = size;
  const dimensionProblem = validateDimensions(width, height);
  if (dimensionProblem) return manual(dimensionProblem);

  const clean = [width === height ? String(width) : `${width}x${height}`];
  const formats = size.format ? [size.format] : [];
  for (const segment of segments.slice(1)) {
    const colour = COLOUR_PATTERN.exec(segment);
    if (!colour) {
      return manual('DummyImage colour shortcuts outside 3- or 6-digit hex require manual review.');
    }
    if (colour[1] === '0') return manual('DummyImage documents that a single zero colour is invalid.');
    clean.push(expandColour(colour[1]));
    if (colour[2]) formats.push(colour[2].toLowerCase());
  }
  if (clean.length === 1) clean.push('CCCCCC', '000000');
  else if (clean.length === 2) clean.push('000000');
  if (formats.length > 1) return manual('Multiple DummyImage format declarations are ambiguous.');

  // Despite older documentation naming GIF, the current live service defaults to PNG.
  clean[clean.length - 1] = `${clean.at(-1)}.${formats[0] ?? 'png'}`;
  return safe(`https://placeholder.photo/${clean.join('/')}${targetQuery}${candidateFragment(candidate)}`);
}

export const dummyimageComProvider = {
  id: 'dummyimage-com',
  label: 'dummyimage.com',
  hosts: new Set(['dummyimage.com', 'www.dummyimage.com']),
  analyse,
};
