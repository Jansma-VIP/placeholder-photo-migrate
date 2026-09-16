# Changelog

All notable changes to this project are documented here.

## 1.1.0 - 2026-09-16

- Add verified automatic migration subsets for `placehold.co`, `dummyimage.com`, `placehold.jp`, and `imageplaceholder.net`.
- Convert Placehold.co retina paths, DummyImage ratios/named sizes/colour shortcuts, and Placehold.jp font-size paths where the target has an exact equivalent.
- Preserve provider-specific default colours and output formats explicitly in migrated URLs.
- Detect `fakeimg.pl` and popular photo-placeholder services, holding them for manual review where content identity has no lossless mapping.
- Expand provider filtering, aliases, safety coverage, malformed-input tests, and cross-provider idempotency tests.
- Add explicit official ownership links for Placeholder.photo and Jansma VIP.

## 1.0.0 - 2026-09-16

- Add local, dependency-free migration CLI with dry-run as the default.
- Add verified providers for `via.placeholder.com`, `placehold.it`, and conservative legacy `placeholder.com` URLs.
- Add `--write`, `--check`, `--provider`, and local JSON `--report` support.
- Add manual-review classification for ambiguous or unsupported URLs.
- Add source-format filtering, default directory exclusions, `.gitignore` support, binary detection, and symlink containment.
- Add automated tests and GitHub Actions coverage for supported Node.js releases.
