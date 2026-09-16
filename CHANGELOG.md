# Changelog

All notable changes to this project are documented here.

## 1.0.0 - 2026-09-16

- Add local, dependency-free migration CLI with dry-run as the default.
- Add verified providers for `via.placeholder.com`, `placehold.it`, and conservative legacy `placeholder.com` URLs.
- Add `--write`, `--check`, `--provider`, and local JSON `--report` support.
- Add manual-review classification for ambiguous or unsupported URLs.
- Add source-format filtering, default directory exclusions, `.gitignore` support, binary detection, and symlink containment.
- Add automated tests and GitHub Actions coverage for supported Node.js releases.
