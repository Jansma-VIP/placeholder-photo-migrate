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

test('Placehold.co documented paths preserve explicit or live default semantics', () => {
  assert.equal(
    one('https://placehold.co/600x400').replacement,
    'https://placeholder.photo/600x400/DDDDDD/999999.svg',
  );
  assert.equal(
    one('http://placehold.co/600x400/000000/FFF?text=Hello+World').replacement,
    'https://placeholder.photo/600x400/000000/FFF.svg?text=Hello+World',
  );
  assert.equal(
    one('//placehold.co/600x400/000/FFF/png').replacement,
    'https://placeholder.photo/600x400/000/FFF.png',
  );
  assert.equal(
    one('https://placehold.co/400.avif').replacement,
    'https://placeholder.photo/400/DDDDDD/999999.avif',
  );
  assert.equal(
    one('https://placehold.co/600x400@2x.png?text=Retina').replacement,
    'https://placeholder.photo/600x400/DDDDDD/999999.png?text=Retina&dpr=2',
  );
});

test('Placehold.co ambiguous or non-equivalent features require manual review', () => {
  for (const source of [
    'https://www.placehold.co/600x400',
    'https://placehold.co/600x400/orange/white',
    'https://placehold.co/600x400/transparent/F00',
    'https://placehold.co/2000x2000@2x.png',
    'https://placehold.co/600x400@2x.svg',
    'https://placehold.co/600x400?font=roboto',
    'https://placehold.co/600x400.png/png',
    'https://placehold.co/4096x4096',
  ]) assert.equal(one(source).status, 'manual', source);
});

test('DummyImage documented numeric paths preserve formats, defaults, colours, and text encoding', () => {
  assert.equal(
    one('https://dummyimage.com/300').replacement,
    'https://placeholder.photo/300/CCCCCC/000000.png',
  );
  assert.equal(
    one('http://dummyimage.com/600x400/abc').replacement,
    'https://placeholder.photo/600x400/aabbcc/000000.png',
  );
  assert.equal(
    one('https://dummyimage.com/600x400/000/fff.png&text=Hello+World').replacement,
    'https://placeholder.photo/600x400/000000/ffffff.png?text=Hello+World',
  );
  assert.equal(
    one('https://dummyimage.com/300.png/09f/fff').replacement,
    'https://placeholder.photo/300/0099ff/ffffff.png',
  );
  assert.equal(
    one('https://dummyimage.com/641x4:3/ef/f').replacement,
    'https://placeholder.photo/641x480/efefef/ffffff.png',
  );
  assert.equal(
    one('https://dummyimage.com/16:9x1001').replacement,
    'https://placeholder.photo/1779x1001/CCCCCC/000000.png',
  );
  assert.equal(
    one('https://dummyimage.com/qvga').replacement,
    'https://placeholder.photo/320x240/CCCCCC/000000.png',
  );
});

test('DummyImage shortcuts and options outside the exact subset require manual review', () => {
  for (const source of [
    'https://www.dummyimage.com/300',
    'https://dummyimage.com/not-a-size',
    'https://dummyimage.com/300/0/fff',
    'https://dummyimage.com/300?text=Hello',
    'https://dummyimage.com/300&text=%ZZ',
    'https://dummyimage.com/300.png/09f.gif/fff',
  ]) assert.equal(one(source).status, 'manual', source);
});

test('Placehold.jp documented basic, colour, and text paths preserve source defaults', () => {
  assert.equal(
    one('https://placehold.jp/150x50.png').replacement,
    'https://placeholder.photo/150x50/CCCCCC/999999.png',
  );
  assert.equal(
    one('http://placehold.jp/ffffff/150x100.png').replacement,
    'https://placeholder.photo/150x100/CCCCCC/ffffff.png',
  );
  assert.equal(
    one('https://placehold.jp/006699/cccc00/150x100.jpg?text=Hello%20World').replacement,
    'https://placeholder.photo/150x100/006699/cccc00.jpg?text=Hello%20World',
  );
  assert.equal(
    one('https://placehold.jp/24/cc9999/993333/150x100.png?text=Card').replacement,
    'https://placeholder.photo/150x100/cc9999/993333.png?text=Card&fontSize=24',
  );
});

test('Placehold.jp unsupported advanced forms require manual review', () => {
  for (const source of [
    'https://www.placehold.jp/150x50.png',
    'https://placehold.jp/999/cc9999/993333/150x100.png',
    'https://placehold.jp/abc/150x100.png',
    'https://placehold.jp/ccc/fff/150x100.png',
    'https://placehold.jp/150x100',
    'https://placehold.jp/150x100.png?css=%7B%7D',
  ]) assert.equal(one(source).status, 'manual', source);
});

test('Fakeimg.pl is detected but always held for manual review', () => {
  for (const source of [
    'https://fakeimg.pl/300/',
    'https://fakeimg.pl/350x200/ff0000/000?text=Hello',
    'https://www.fakeimg.pl/300/',
  ]) {
    const finding = one(source);
    assert.equal(finding.provider, 'fakeimg-pl');
    assert.equal(finding.status, 'manual');
    assert.equal(finding.replacement, null);
  }
});

test('new provider aliases normalize and filtering remains exact', () => {
  assert.deepEqual(
    [...normalizeProviderIds(['placehold.co,dummyimage.com', 'placehold.jp', 'fakeimg.pl'])],
    ['placehold-co', 'dummyimage-com', 'placehold-jp', 'fakeimg-pl'],
  );
  const selected = normalizeProviderIds(['dummyimage-com']);
  const findings = scanSource(
    'https://placehold.co/100 https://dummyimage.com/200 https://placehold.jp/300x100.png',
    selected,
  );
  assert.deepEqual(findings.map((finding) => finding.provider), ['dummyimage-com']);
});

test('lookalike hosts for every new provider are ignored', () => {
  const source = [
    'https://placehold.co.evil.example/300',
    'https://dummyimage.com.evil.example/300',
    'https://placehold.jp.evil.example/300x200.png',
    'https://fakeimg.pl.evil.example/300',
  ].join(' ');
  assert.deepEqual(scanSource(source, allProviders), []);
});

test('mixed new providers migrate independently and remain idempotent', () => {
  const source = [
    'https://placehold.co/100',
    'https://dummyimage.com/200/abc/123.jpg&text=Card',
    'https://placehold.jp/300x100.png',
    'https://fakeimg.pl/400/',
  ].join(' ');
  const firstFindings = scanSource(source, allProviders);
  assert.deepEqual(firstFindings.map((finding) => finding.status), ['safe', 'safe', 'safe', 'manual']);
  const migrated = applySafeFindings(source, firstFindings);
  const secondFindings = scanSource(migrated, allProviders);
  assert.equal(secondFindings.length, 1);
  assert.equal(secondFindings[0].provider, 'fakeimg-pl');
});

test('ImagePlaceholder.net preserves documented colours, text, PNG, and live defaults', () => {
  assert.equal(
    one('https://imageplaceholder.net/600x400').replacement,
    'https://placeholder.photo/600x400/EEEEEE/313131.png',
  );
  assert.equal(
    one('http://imageplaceholder.net/600x400/eeeeee').replacement,
    'https://placeholder.photo/600x400/eeeeee/313131.png',
  );
  assert.equal(
    one('https://imageplaceholder.net/600x400/4fe8b8/000000?text=Your+text').replacement,
    'https://placeholder.photo/600x400/4fe8b8/000000.png?text=Your+text',
  );
  assert.equal(one('https://imageplaceholder.net/600x400?tag=Summer+beach').status, 'manual');
});

test('popular photo placeholder services are detected for lossless manual migration', () => {
  const cases = [
    ['https://picsum.photos/200/300', 'picsum-photos'],
    ['https://unsplash.it/200/300', 'picsum-photos'],
    ['https://loremflickr.com/320/240/cat', 'loremflickr'],
    ['https://placeimg.com/640/480/nature', 'placeimg-com'],
    ['https://lorempixel.com/400/200/', 'lorempixel-com'],
    ['https://placekitten.com/300/200', 'placekitten'],
    ['https://source.unsplash.com/300x200/?nature', 'source-unsplash'],
    ['https://placehold.net/600x600', 'placehold-net'],
  ];
  for (const [source, provider] of cases) {
    const finding = one(source);
    assert.equal(finding.provider, provider);
    assert.equal(finding.status, 'manual');
  }
});
