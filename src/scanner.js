import { providerForHostname, providerHostPattern } from './providers/index.js';

const LEGACY_URL_PATTERN = new RegExp(
  `(?:(?<![A-Za-z0-9_+.-])https?:\\/\\/|(?<![A-Za-z0-9_+./:-])\\/\\/)(?:${providerHostPattern})(?::\\d{1,5})?(?![A-Za-z0-9._:-])(?:[/?#][^\\s"'<>\u0060\\\\)\\]}]*)?`,
  'giu',
);
const CANDIDATE_PATTERN = /^(?:(https?):)?\/\/([^/?#:]+)(?::(\d{1,5}))?(.*)$/iu;

function lineStartsFor(content) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function sourcePosition(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return { line: high + 1, column: offset - lineStarts[high] + 1 };
}

function parseCandidate(raw) {
  const match = CANDIDATE_PATTERN.exec(raw);
  if (!match) return null;

  const suffix = match[4] || '';
  const fragmentAt = suffix.indexOf('#');
  const beforeFragment = fragmentAt === -1 ? suffix : suffix.slice(0, fragmentAt);
  const queryAt = beforeFragment.indexOf('?');
  const path = queryAt === -1 ? beforeFragment : beforeFragment.slice(0, queryAt);
  const query = queryAt === -1 ? '' : beforeFragment.slice(queryAt);

  return {
    raw,
    protocol: match[1]?.toLowerCase() ?? null,
    hostname: match[2].toLowerCase(),
    port: match[3] ?? null,
    suffix,
    path,
    query,
  };
}

export function scanSource(content, selectedProviderIds) {
  const lineStarts = lineStartsFor(content);
  const findings = [];
  LEGACY_URL_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(LEGACY_URL_PATTERN)) {
    const candidate = parseCandidate(match[0]);
    if (!candidate) continue;
    const provider = providerForHostname(candidate.hostname);
    if (!provider || !selectedProviderIds.has(provider.id)) continue;

    const result = provider.analyse(candidate);
    const position = sourcePosition(lineStarts, match.index);
    findings.push({
      provider: provider.id,
      providerLabel: provider.label,
      status: result.status,
      confidence: result.confidence,
      reason: result.reason,
      original: match[0],
      replacement: result.replacement,
      start: match.index,
      end: match.index + match[0].length,
      ...position,
    });
  }

  return findings;
}

export function applySafeFindings(content, findings) {
  const safe = findings.filter((finding) => finding.status === 'safe').sort((a, b) => b.start - a.start);
  let migrated = content;
  for (const finding of safe) {
    migrated = `${migrated.slice(0, finding.start)}${finding.replacement}${migrated.slice(finding.end)}`;
  }
  return migrated;
}
