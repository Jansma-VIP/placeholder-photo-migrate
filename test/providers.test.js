import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderIds } from '../src/providers/index.js';
import { applySafeFindings, scanSource } from '../src/scanner.js';

const allProviders = normalizeProviderIds([]);

function one(source) {
  const findings = scanSource(source, allProviders);
  assert.equal(findings.length, 1);
  return findings[0];
}

test('via.placeholder.com dimensions migrate safely', () => {
  const finding = one('https://via.placeholder.com/600');
  assert.equal(finding.status, 'safe');
  assert.equal(finding.replacement, 'https://placeholder.photo/600');
});

test('dimensions and both colours are preserved exactly', () => {
  const source = 'https://via.placeholder.com/300x200/000000/ffffff';
  assert.equal(one(source).replacement, 'https://placeholder.photo/300x200/000000/ffffff');
});

test('custom text and plus encoding are preserved without double encoding', () => {
  const source = 'https://via.placeholder.com/300x200/000/fff?text=Hello+World';
  assert.equal(one(source).replacement, 'https://placeholder.photo/300x200/000/fff?text=Hello+World');
});

test('percent encoding is retained byte for byte', () => {
  const source = 'https://via.placeholder.com/300?text=Hello%20World%20%26%20friends';
  assert.equal(one(source).replacement, 'https://placeholder.photo/300?text=Hello%20World%20%26%20friends');
});

for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
  test(`verified .${extension} extension is retained`, () => {
    const source = `https://via.placeholder.com/300x150/a51c30/ffffff.${extension}`;
    assert.equal(one(source).replacement, `https://placeholder.photo/300x150/a51c30/ffffff.${extension}`);
  });
}

test('HTTP input becomes canonical HTTPS', () => {
  assert.equal(one('http://via.placeholder.com/300').replacement, 'https://placeholder.photo/300');
});

test('protocol-relative input becomes canonical HTTPS', () => {
  assert.equal(one('//via.placeholder.com/300').replacement, 'https://placeholder.photo/300');
});

test('trailing slash is preserved', () => {
  assert.equal(one('https://via.placeholder.com/300/').replacement, 'https://placeholder.photo/300/');
});

test('historical img alias is covered by the live implementation', () => {
  assert.equal(one('https://via.placeholder.com/img/255').replacement, 'https://placeholder.photo/img/255');
});

test('placehold.it uses its own provider', () => {
  const finding = one('http://placehold.it/350x150/abc/123?text=Card');
  assert.equal(finding.provider, 'placehold-it');
  assert.equal(finding.status, 'safe');
  assert.equal(finding.replacement, 'https://placeholder.photo/350x150/abc/123?text=Card');
});

test('safe legacy placeholder.com image path migrates', () => {
  const finding = one('https://placeholder.com/400x300/FF5733/FFFFFF');
  assert.equal(finding.provider, 'placeholder-com');
  assert.equal(finding.status, 'safe');
});

test('placeholder.com non-image page is manual review and never replaced', () => {
  const finding = one('https://placeholder.com/about');
  assert.equal(finding.status, 'manual');
  assert.equal(finding.replacement, null);
});

test('www.placeholder.com is conservatively manual review', () => {
  assert.equal(one('https://www.placeholder.com/300x200').status, 'manual');
});

test('www.placehold.it is manual review because the host variant is unverified', () => {
  assert.equal(one('https://www.placehold.it/300x200').status, 'manual');
});

test('malformed URL path is manual review', () => {
  assert.equal(one('https://via.placeholder.com/300x/nope').status, 'manual');
});

test('ambiguous query parameters remain unchanged', () => {
  const finding = one('https://via.placeholder.com/300?foo=bar');
  assert.equal(finding.status, 'manual');
  assert.match(finding.reason, /query/i);
});

test('multiple query parameters remain manual review', () => {
  assert.equal(one('https://via.placeholder.com/300?text=Hello&font=serif').status, 'manual');
});

test('malformed percent encoding remains manual review', () => {
  assert.equal(one('https://via.placeholder.com/300?text=%ZZ').status, 'manual');
});

test('explicit ports remain manual review', () => {
  assert.equal(one('https://via.placeholder.com:443/300').status, 'manual');
});

test('dimensions beyond live limits remain manual review', () => {
  assert.equal(one('https://via.placeholder.com/4096x4096').status, 'manual');
});

test('formats outside the verified legacy matrix remain manual review', () => {
  assert.equal(one('https://via.placeholder.com/300.svg').status, 'manual');
  assert.equal(one('https://via.placeholder.com/300.avif').status, 'manual');
});

test('multiple suffixes remain manual review', () => {
  assert.equal(one('https://via.placeholder.com/300.png/fff.jpg').status, 'manual');
});

test('already migrated URLs are untouched', () => {
  assert.deepEqual(scanSource('https://placeholder.photo/300x200', allProviders), []);
});

test('lookalike and embedded hosts are not mistaken for legacy URLs', () => {
  const source = [
    'https://via.placeholder.com.evil.example/300',
    'ftp://via.placeholder.com/300',
    'javascript://via.placeholder.com/300',
    'https://example.test//via.placeholder.com/300',
  ].join(' ');
  assert.deepEqual(scanSource(source, allProviders), []);
});

test('multiple URLs in one file are independently classified and replaced', () => {
  const source = 'A https://via.placeholder.com/100 B http://placehold.it/200x100 C https://placeholder.com/docs';
  const findings = scanSource(source, allProviders);
  assert.equal(findings.length, 3);
  assert.deepEqual(findings.map((finding) => finding.status), ['safe', 'safe', 'manual']);
  assert.equal(
    applySafeFindings(source, findings),
    'A https://placeholder.photo/100 B https://placeholder.photo/200x100 C https://placeholder.com/docs',
  );
});

test('line and column locations are deterministic', () => {
  const findings = scanSource('first\n  https://via.placeholder.com/100', allProviders);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].column, 3);
});

test('provider filtering only selects requested providers', () => {
  const selected = normalizeProviderIds(['via-placeholder']);
  const findings = scanSource('https://via.placeholder.com/100 http://placehold.it/200', selected);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].provider, 'via-placeholder');
});

test('provider aliases and comma-separated filters normalize', () => {
  assert.deepEqual(
    [...normalizeProviderIds(['via.placeholder.com,placehold.it'])],
    ['via-placeholder', 'placehold-it'],
  );
});
