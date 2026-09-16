import path from 'node:path';
import { VERSION } from './version.js';

export function createReport({ mode, root, target, filesScanned, filesChanged, findings, skipped }) {
  const safe = findings.filter((finding) => finding.status === 'safe').length;
  const manual = findings.length - safe;
  return {
    tool: 'placeholder-photo-migrate',
    reportVersion: 1,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    target: path.relative(root, target).replaceAll(path.sep, '/') || '.',
    privacy: 'Local-only scan. No source code or telemetry was transmitted.',
    summary: {
      filesScanned,
      filesChanged,
      legacyUrls: findings.length,
      safeMigrations: safe,
      manualReview: manual,
      skipped,
    },
    findings: findings.map((finding) => ({
      file: finding.file,
      line: finding.line,
      column: finding.column,
      provider: finding.provider,
      status: finding.status,
      confidence: finding.confidence,
      original: finding.original,
      replacement: finding.replacement,
      reason: finding.reason,
    })),
  };
}
