import path from 'node:path';
import {
  collectSourceFiles,
  isGeneratedReport,
  readTextFile,
  resolveReportPath,
  resolveScanTarget,
  safeWriteTextFile,
  writeReportFile,
} from './files.js';
import { parseOptions } from './options.js';
import { normalizeProviderIds } from './providers/index.js';
import { createReport } from './report.js';
import { applySafeFindings, scanSource } from './scanner.js';
import { VERSION } from './version.js';

const HELP = `placeholder-photo-migrate ${VERSION}

Safely migrate verified legacy placeholder image URLs to https://placeholder.photo.

Usage:
  placeholder-photo-migrate [path] [options]

Examples:
  npx placeholder-photo-migrate .
  npx placeholder-photo-migrate . --write
  npx placeholder-photo-migrate . --check

Options:
  --write                 Apply safe migrations (default is dry-run)
  --check                 CI check; never writes source files
  --provider <provider>   Limit to a supported provider ID (repeat or comma-separate)
  --report <file>         Write a local JSON report inside the selected project
  -h, --help              Show help
  -v, --version           Show version

Exit codes:
  0  No legacy URLs found
  1  Legacy URLs found (including manual-review findings)
  2  Runtime or usage error
`;

const MAX_FINDINGS = 100_000;
const MAX_PENDING_WRITE_BYTES = 128 * 1024 * 1024;

function relativeFile(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/') || path.basename(file);
}

function writeLine(stream, value = '') {
  stream.write(`${value}\n`);
}

function safeDisplay(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => {
    return `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`;
  });
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  try {
    const options = parseOptions(argv);
    if (options.help) {
      stdout.write(HELP);
      return 0;
    }
    if (options.version) {
      writeLine(stdout, VERSION);
      return 0;
    }

    const selectedProviderIds = normalizeProviderIds(options.providers);
    const scanTarget = await resolveScanTarget(options.target);
    const reportPath = options.report ? await resolveReportPath(options.report, scanTarget.root) : null;
    const excludedPaths = new Set(reportPath ? [reportPath] : []);
    const collected = await collectSourceFiles(scanTarget, excludedPaths);
    const findings = [];
    const pendingWrites = [];
    let pendingWriteBytes = 0;
    let filesScanned = 0;

    for (const file of collected.files) {
      const loaded = await readTextFile(file);
      if (loaded.kind === 'binary') {
        collected.skipped.binary += 1;
        continue;
      }
      if (loaded.kind === 'large') {
        collected.skipped.large += 1;
        continue;
      }
      if (isGeneratedReport(loaded.content)) {
        collected.skipped.report += 1;
        continue;
      }

      filesScanned += 1;
      const fileFindings = scanSource(loaded.content, selectedProviderIds).map((finding) => ({
        ...finding,
        file: relativeFile(scanTarget.root, file),
      }));
      findings.push(...fileFindings);
      if (findings.length > MAX_FINDINGS) {
        throw new Error(`Scan exceeded the safety limit of ${MAX_FINDINGS} findings.`);
      }

      if (options.write && fileFindings.some((finding) => finding.status === 'safe')) {
        const migrated = `${loaded.hasBom ? '\uFEFF' : ''}${applySafeFindings(loaded.content, fileFindings)}`;
        pendingWriteBytes += Buffer.byteLength(migrated, 'utf8');
        if (pendingWriteBytes > MAX_PENDING_WRITE_BYTES) {
          throw new Error('Pending migrations exceed the 128 MiB write safety limit. Migrate a smaller project scope.');
        }
        pendingWrites.push({
          file,
          content: migrated,
          mode: loaded.mode,
        });
      }
    }

    for (const finding of findings) {
      const location = `${safeDisplay(finding.file)}:${finding.line}:${finding.column}`;
      if (finding.status === 'safe') {
        writeLine(stdout, `SAFE   ${location}  ${safeDisplay(finding.original)}`);
        writeLine(stdout, `       -> ${safeDisplay(finding.replacement)}`);
      } else {
        writeLine(stdout, `MANUAL ${location}  ${safeDisplay(finding.original)}`);
        writeLine(stdout, `       ${safeDisplay(finding.reason)}`);
      }
    }

    for (const pending of pendingWrites) {
      await safeWriteTextFile(pending.file, pending.content, scanTarget.root, pending.mode);
    }

    const safeCount = findings.filter((finding) => finding.status === 'safe').length;
    const manualCount = findings.length - safeCount;
    const mode = options.write ? 'write' : options.check ? 'check' : 'dry-run';

    if (reportPath) {
      const report = createReport({
        mode,
        root: scanTarget.root,
        target: scanTarget.target,
        filesScanned,
        filesChanged: pendingWrites.length,
        findings,
        skipped: collected.skipped,
      });
      await writeReportFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, scanTarget.root);
      writeLine(stdout, `Report: ${relativeFile(scanTarget.root, reportPath)}`);
    }

    if (findings.length === 0) {
      writeLine(stdout, `No legacy placeholder URLs found in ${filesScanned} file${filesScanned === 1 ? '' : 's'}.`);
      return 0;
    }

    writeLine(stdout);
    writeLine(stdout, `${findings.length} legacy URL${findings.length === 1 ? '' : 's'} found: ${safeCount} safe, ${manualCount} manual review.`);
    if (options.write) writeLine(stdout, `${pendingWrites.length} file${pendingWrites.length === 1 ? '' : 's'} updated. Run again to verify the migrated URLs are gone.`);
    else if (options.check) writeLine(stdout, 'CI check failed because legacy URLs remain.');
    else writeLine(stdout, 'Dry run only. Re-run with --write to apply safe migrations.');
    writeLine(stdout, 'Your source code is never uploaded to Placeholder.photo. No telemetry is collected.');
    return 1;
  } catch (error) {
    writeLine(stderr, `Error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
