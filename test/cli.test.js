import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.js';

function outputSink() {
  let value = '';
  return {
    write(chunk) {
      value += String(chunk);
      return true;
    },
    value() {
      return value;
    },
  };
}

async function invoke(args) {
  const stdout = outputSink();
  const stderr = outputSink();
  const code = await runCli(args, { stdout, stderr });
  return { code, stdout: stdout.value(), stderr: stderr.value() };
}

async function makeProject(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'placeholder-photo-migrate-test-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}

const contexts = {
  'index.html': '<img src="https://via.placeholder.com/300x200">',
  'style.css': '.hero { background: url(https://via.placeholder.com/300x200); }',
  'style.scss': '$image: "https://via.placeholder.com/300x200";',
  'style.sass': '$image: https://via.placeholder.com/300x200',
  'style.less': '@image: "https://via.placeholder.com/300x200";',
  'app.js': 'const image = "https://via.placeholder.com/300x200";',
  'view.jsx': 'export const image = <img src="https://via.placeholder.com/300x200" />;',
  'module.mjs': 'export default "https://via.placeholder.com/300x200";',
  'module.cjs': 'module.exports = "https://via.placeholder.com/300x200";',
  'app.ts': 'const image: string = "https://via.placeholder.com/300x200";',
  'view.tsx': 'export const image = <img src="https://via.placeholder.com/300x200" />;',
  'view.vue': '<template><img src="https://via.placeholder.com/300x200"></template>',
  'view.svelte': '<img src="https://via.placeholder.com/300x200" alt="">',
  'page.php': '<?php $image = "https://via.placeholder.com/300x200";',
  'README.md': '![Example](https://via.placeholder.com/300x200)',
  'page.mdx': '<img src="https://via.placeholder.com/300x200" />',
  'data.json': '{"image":"https://via.placeholder.com/300x200"}',
  'data.jsonc': '{"image":"https://via.placeholder.com/300x200" // legacy\n}',
  'data.yaml': 'image: https://via.placeholder.com/300x200',
  'data.yml': 'image: https://via.placeholder.com/300x200',
  'feed.xml': '<image>https://via.placeholder.com/300x200</image>',
  'notes.txt': 'https://via.placeholder.com/300x200',
};

for (const [filename, contents] of Object.entries(contexts)) {
  test(`scans and writes ${path.extname(filename)} source (${filename})`, async (context) => {
    const root = await makeProject({ [filename]: contents });
    context.after(() => rm(root, { recursive: true, force: true }));
    const result = await invoke([root, '--write']);
    assert.equal(result.code, 1);
    assert.match(await readFile(path.join(root, filename), 'utf8'), /https:\/\/placeholder\.photo\/300x200/);
  });
}

test('default mode is a non-destructive dry run', async (context) => {
  const original = '<img src="https://via.placeholder.com/600/92c952">';
  const root = await makeProject({ 'index.html': original });
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = await invoke([root]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /Dry run only/);
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), original);
});

test('--write updates safe URLs but leaves manual findings unchanged', async (context) => {
  const root = await makeProject({
    'index.html': 'https://via.placeholder.com/300 https://placeholder.com/about',
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = await invoke([root, '--write']);
  const updated = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.equal(result.code, 1);
  assert.equal(updated, 'https://placeholder.photo/300 https://placeholder.com/about');
  assert.match(result.stdout, /MANUAL/);
});

test('--check returns 1 and never writes', async (context) => {
  const original = 'https://via.placeholder.com/300';
  const root = await makeProject({ 'app.js': original });
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = await invoke([root, '--check']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /CI check failed/);
  assert.equal(await readFile(path.join(root, 'app.js'), 'utf8'), original);
});

test('clean project returns exit code 0', async (context) => {
  const root = await makeProject({ 'app.js': 'https://placeholder.photo/300' });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--check'])).code, 0);
});

test('usage and runtime errors return exit code 2', async () => {
  assert.equal((await invoke(['--unknown'])).code, 2);
  assert.equal((await invoke(['/definitely/not/a/real/project'])).code, 2);
  assert.equal((await invoke(['.', '--write', '--check'])).code, 2);
});

test('--provider limits detection and writing', async (context) => {
  const root = await makeProject({
    'app.js': 'https://via.placeholder.com/100 http://placehold.it/200',
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = await invoke([root, '--write', '--provider', 'via-placeholder']);
  assert.equal(result.code, 1);
  assert.equal(await readFile(path.join(root, 'app.js'), 'utf8'), 'https://placeholder.photo/100 http://placehold.it/200');
  assert.equal((await invoke([root, '--check', '--provider', 'via-placeholder'])).code, 0);
});

test('--report writes structured local JSON and the report never scans itself', async (context) => {
  const root = await makeProject({ 'app.js': 'https://via.placeholder.com/100' });
  context.after(() => rm(root, { recursive: true, force: true }));
  const reportPath = path.join(root, 'audit.json');

  const write = await invoke([root, '--write', '--report', reportPath]);
  assert.equal(write.code, 1);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.tool, 'placeholder-photo-migrate');
  assert.equal(report.reportVersion, 1);
  assert.equal(report.summary.safeMigrations, 1);
  assert.equal(report.findings[0].original, 'https://via.placeholder.com/100');
  assert.equal((await invoke([root, '--check'])).code, 0);
});

test('report path traversal outside the project is rejected', async (context) => {
  const root = await makeProject({ 'app.js': 'clean' });
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(path.dirname(root), 'outside-report.json');
  const result = await invoke([root, '--report', outside]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /inside the selected project/);
});

test('write is idempotent', async (context) => {
  const root = await makeProject({ 'app.js': 'https://via.placeholder.com/100' });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--write'])).code, 1);
  const once = await readFile(path.join(root, 'app.js'), 'utf8');
  assert.equal((await invoke([root, '--write'])).code, 0);
  assert.equal(await readFile(path.join(root, 'app.js'), 'utf8'), once);
});

test('UTF-8 byte order mark is preserved when writing', async (context) => {
  const root = await makeProject({ 'app.js': Buffer.from('\uFEFFhttps://via.placeholder.com/100', 'utf8') });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--write'])).code, 1);
  const updated = await readFile(path.join(root, 'app.js'));
  assert.deepEqual([...updated.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(updated.subarray(3).toString('utf8'), 'https://placeholder.photo/100');
});

test('control characters in filenames are escaped in terminal output', async (context) => {
  const filename = 'unsafe\nname.js';
  const root = await makeProject({ [filename]: 'https://via.placeholder.com/100' });
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await invoke([root]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /unsafe\\u000aname\.js/);
  assert.doesNotMatch(result.stdout, /unsafe\nname\.js/);
});

test('binary files are skipped', async (context) => {
  const root = await makeProject({ 'binary.txt': Buffer.from('before\0https://via.placeholder.com/300') });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--write'])).code, 0);
  const contents = await readFile(path.join(root, 'binary.txt'));
  assert.equal(contents.includes(Buffer.from('via.placeholder.com')), true);
});

test('default excluded directories are not scanned', async (context) => {
  const root = await makeProject({
    'node_modules/example/index.js': 'https://via.placeholder.com/300',
    'vendor/example.php': 'https://via.placeholder.com/300',
    'dist/app.js': 'https://via.placeholder.com/300',
    'src/app.js': 'https://placeholder.photo/300',
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--check'])).code, 0);
});

test('root .gitignore is respected', async (context) => {
  const root = await makeProject({
    '.gitignore': 'ignored/\n*.generated.js\n',
    'ignored/app.js': 'https://via.placeholder.com/300',
    'src/app.generated.js': 'https://via.placeholder.com/300',
    'src/app.js': 'clean',
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--check'])).code, 0);
});

test('symlinked files are not followed outside project scope', async (context) => {
  const outsideRoot = await makeProject({ 'outside.js': 'https://via.placeholder.com/300' });
  const root = await makeProject({ 'app.js': 'clean' });
  context.after(() => rm(root, { recursive: true, force: true }));
  context.after(() => rm(outsideRoot, { recursive: true, force: true }));
  const outside = path.join(outsideRoot, 'outside.js');
  await symlink(outside, path.join(root, 'linked.js'));

  assert.equal((await invoke([root, '--write'])).code, 0);
  assert.equal(await readFile(outside, 'utf8'), 'https://via.placeholder.com/300');
});

test('a symlink selected as the project target is rejected', async (context) => {
  const root = await makeProject({ 'app.js': 'https://via.placeholder.com/300' });
  const linkRoot = await mkdtemp(path.join(os.tmpdir(), 'placeholder-photo-migrate-link-'));
  const link = path.join(linkRoot, 'project-link');
  await symlink(root, link);
  context.after(() => rm(linkRoot, { recursive: true, force: true }));
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = await invoke([link, '--write']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /symbolic link/);
});

test('unsupported extensions are skipped', async (context) => {
  const root = await makeProject({ 'image.png': 'https://via.placeholder.com/300', 'app.js': 'clean' });
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await invoke([root, '--check'])).code, 0);
});

test('a single supported source file can be selected directly', async (context) => {
  const root = await makeProject({ 'nested/app.js': 'https://via.placeholder.com/300' });
  context.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'nested/app.js');
  assert.equal((await invoke([file, '--write'])).code, 1);
  assert.equal(await readFile(file, 'utf8'), 'https://placeholder.photo/300');
});

test('help and version exit successfully', async () => {
  const help = await invoke(['--help']);
  const version = await invoke(['--version']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Dry-run|dry-run/i);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /^1\.0\.0/);
});
