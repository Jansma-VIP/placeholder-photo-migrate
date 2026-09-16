import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createGitIgnoreMatcher } from './gitignore.js';

const SOURCE_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.vue', '.svelte', '.php', '.md', '.mdx', '.json', '.jsonc', '.yaml', '.yml', '.xml', '.txt',
]);

const EXCLUDED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.cache', 'tmp', 'temp',
]);

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SOURCE_FILES = 100_000;

export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function resolveScanTarget(inputPath) {
  const absolute = path.resolve(inputPath);
  const linkStatus = await lstat(absolute);
  if (linkStatus.isSymbolicLink()) throw new Error('The selected target cannot be a symbolic link.');
  if (!linkStatus.isDirectory() && !linkStatus.isFile()) throw new Error('The selected target must be a file or directory.');

  const resolved = await realpath(absolute);
  return {
    target: resolved,
    root: linkStatus.isDirectory() ? resolved : await realpath(path.dirname(resolved)),
    isFile: linkStatus.isFile(),
  };
}

async function rootIgnoreMatcher(root, isFile) {
  if (isFile) return () => false;
  try {
    const contents = await readFile(path.join(root, '.gitignore'), 'utf8');
    return createGitIgnoreMatcher(contents);
  } catch (error) {
    if (error?.code === 'ENOENT') return () => false;
    throw error;
  }
}

export async function collectSourceFiles(scanTarget, excludedAbsolutePaths = new Set()) {
  const ignored = await rootIgnoreMatcher(scanTarget.root, scanTarget.isFile);
  const files = [];
  const skipped = { binary: 0, large: 0, symlink: 0, ignored: 0, unsupported: 0, report: 0 };

  const visit = async (absolute) => {
    const linkStatus = await lstat(absolute);
    if (linkStatus.isSymbolicLink()) {
      skipped.symlink += 1;
      return;
    }

    const resolved = await realpath(absolute);
    if (!isWithin(scanTarget.root, resolved)) {
      skipped.symlink += 1;
      return;
    }
    if (excludedAbsolutePaths.has(resolved)) {
      skipped.report += 1;
      return;
    }

    const relative = path.relative(scanTarget.root, resolved).replaceAll(path.sep, '/');
    if (linkStatus.isDirectory()) {
      if (resolved !== scanTarget.root && (EXCLUDED_DIRECTORIES.has(path.basename(resolved).toLowerCase()) || ignored(relative))) {
        skipped.ignored += 1;
        return;
      }
      const entries = await readdir(resolved, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) await visit(path.join(resolved, entry.name));
      return;
    }

    if (!linkStatus.isFile()) return;
    if (ignored(relative)) {
      skipped.ignored += 1;
      return;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      skipped.unsupported += 1;
      return;
    }
    if (linkStatus.size > MAX_FILE_BYTES) {
      skipped.large += 1;
      return;
    }
    files.push(resolved);
    if (files.length > MAX_SOURCE_FILES) {
      throw new Error(`Project contains more than the ${MAX_SOURCE_FILES} supported source files.`);
    }
  };

  await visit(scanTarget.target);
  return { files, skipped };
}

export async function readTextFile(absolute) {
  const fileStatus = await stat(absolute);
  if (fileStatus.size > MAX_FILE_BYTES) return { kind: 'large' };
  const buffer = await readFile(absolute);
  if (buffer.includes(0)) return { kind: 'binary' };

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    return {
      kind: 'text',
      content: decoder.decode(hasBom ? buffer.subarray(3) : buffer),
      hasBom,
      mode: fileStatus.mode,
    };
  } catch {
    return { kind: 'binary' };
  }
}

export function isGeneratedReport(content) {
  const header = content.slice(0, 4096);
  return /"tool"\s*:\s*"placeholder-photo-migrate"/.test(header)
    && /"reportVersion"\s*:\s*1/.test(header);
}

export async function safeWriteTextFile(absolute, content, root, mode) {
  const parent = await realpath(path.dirname(absolute));
  const current = await lstat(absolute);
  if (current.isSymbolicLink() || !current.isFile()) throw new Error(`Refusing to overwrite unsafe path: ${absolute}`);
  if (!isWithin(root, parent) || !isWithin(root, await realpath(absolute))) {
    throw new Error(`Refusing to write outside the selected project: ${absolute}`);
  }

  const temporary = path.join(parent, `.placeholder-photo-migrate-${process.pid}-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', mode & 0o777);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, absolute);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function resolveReportPath(reportPath, root) {
  const absolute = path.isAbsolute(reportPath) ? path.resolve(reportPath) : path.resolve(root, reportPath);
  const parent = path.dirname(absolute);
  await mkdir(parent, { recursive: false }).catch((error) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  const resolvedParent = await realpath(parent);
  if (!isWithin(root, resolvedParent)) throw new Error('The report path must stay inside the selected project.');
  try {
    const status = await lstat(absolute);
    if (status.isSymbolicLink() || !status.isFile()) throw new Error('The report path is not a safe regular file.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return path.join(resolvedParent, path.basename(absolute));
}

export async function writeReportFile(absolute, contents, root) {
  const parent = await realpath(path.dirname(absolute));
  if (!isWithin(root, parent)) throw new Error('The report path must stay inside the selected project.');
  try {
    const current = await lstat(absolute);
    if (current.isSymbolicLink() || !current.isFile()) throw new Error('Refusing to overwrite an unsafe report path.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const temporary = path.join(parent, `.placeholder-photo-migrate-report-${process.pid}-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, absolute);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}
