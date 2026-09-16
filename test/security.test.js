import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('package has no runtime dependencies or lifecycle install scripts', async () => {
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.optionalDependencies, undefined);
  assert.equal(manifest.scripts.preinstall, undefined);
  assert.equal(manifest.scripts.install, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);
});

test('runtime source imports only Node built-ins or local modules', async () => {
  const directories = [path.join(projectRoot, 'src'), path.join(projectRoot, 'src/providers'), path.join(projectRoot, 'bin')];
  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const source = await readFile(path.join(directory, entry.name), 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        assert.ok(match[1].startsWith('.') || match[1].startsWith('node:'), `Unexpected runtime import: ${match[1]}`);
      }
    }
  }
});

test('runtime contains no network or telemetry transports', async () => {
  const files = ['src/cli.js', 'src/files.js', 'src/report.js', 'src/scanner.js'];
  for (const relative of files) {
    const source = await readFile(path.join(projectRoot, relative), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|https?\.request\s*\(|XMLHttpRequest|sendBeacon|from\s+['"]node:https?['"]/i);
  }
});
