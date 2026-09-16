# Placeholder.photo Migration CLI

The official, local migration tool for moving verified legacy placeholder image URLs to [Placeholder.photo](https://placeholder.photo).

Placeholder.photo is a free URL-first image toolkit operated by Jansma VIP. This CLI finds common dead or legacy placeholder URLs, classifies them against Placeholder.photo's versioned compatibility rules, and can safely update the compatible cases.

## Quick start

Preview a migration without changing files:

```sh
npx placeholder-photo-migrate .
```

Apply only verified, safe migrations:

```sh
npx placeholder-photo-migrate . --write
```

Fail CI when legacy URLs remain:

```sh
npx placeholder-photo-migrate . --check
```

Dry-run is always the default. Source files are changed only when `--write` is explicitly present.

## What it migrates

The CLI has a separate, centrally tested provider for each legacy service:

| Provider | Example | Automatic behavior |
|---|---|---|
| `via.placeholder.com` | `https://via.placeholder.com/600/92c952` | Verified classic paths are migrated |
| `placehold.it` | `http://placehold.it/300x200` | Verified classic paths are migrated |
| legacy `placeholder.com` | `https://placeholder.com/300x200` | Only an exact, provable image path is migrated |

Example:

```text
https://via.placeholder.com/300x200/000000/ffffff?text=Hello+World
https://placeholder.photo/300x200/000000/ffffff?text=Hello+World
```

Safe migrations retain the dimensions, background and foreground colours, custom text, URL encoding, trailing slash, query string, and verified raster extension exactly. HTTP, HTTPS, and protocol-relative source URLs all become the canonical HTTPS Placeholder.photo URL.

The automatic compatibility subset is deliberately narrow:

- square or `width×height` dimensions within live rendering limits;
- optional 3- or 6-digit hexadecimal background and text colours;
- optional `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp` suffix;
- one optional, correctly encoded `text` query parameter;
- the historical `/img/` path alias accepted by Placeholder.photo.

Anything ambiguous is left unchanged and reported as **manual review required**. In particular, the CLI never performs a blind replacement of every `placeholder.com` reference.

See the official [compatibility guide](https://placeholder.photo/compatibility) and [migration CLI documentation](https://placeholder.photo/docs/migration-cli).

## Options

```text
--write                 Apply safe migrations (default is dry-run)
--check                 CI check; never writes source files
--provider <provider>   Limit the scan to one or more providers
--report <file>         Write a local JSON report inside the project
-h, --help              Show help
-v, --version           Show version
```

Provider names are `via-placeholder`, `placehold-it`, and `placeholder-com`. `--provider` can be repeated or given a comma-separated list.

```sh
npx placeholder-photo-migrate . --provider via-placeholder
npx placeholder-photo-migrate . --provider via-placeholder,placehold-it --report migration-report.json
```

Reports contain file locations and URL-level decisions. They are written locally, are excluded from their own scan, and are never transmitted.

## Supported source files

The scanner handles:

```text
.html .htm .css .scss .sass .less
.js .jsx .mjs .cjs .ts .tsx
.vue .svelte .php .md .mdx
.json .jsonc .yaml .yml .xml .txt
```

It skips binary and invalid UTF-8 files, files larger than 10 MiB, symlinks, unsupported extensions, and these directories by default:

```text
.git node_modules vendor dist build coverage .cache tmp temp
```

The root `.gitignore` is respected for common ignore patterns. Symlinks are not followed, report files must remain inside the selected project, and writes use same-directory atomic replacement.

## CI

```yaml
- name: Check legacy placeholder URLs
  run: npx --yes placeholder-photo-migrate . --check
```

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | No selected legacy URLs were found |
| `1` | Legacy URLs were found, including manual-review findings |
| `2` | Usage, filesystem, or runtime error |

A successful `--write` run still returns `1` because legacy URLs were found during that run. Run the command again: a fully migrated project returns `0` unless unresolved manual-review URLs remain.

## Privacy and security

**Your source code is never uploaded to Placeholder.photo.**

The CLI runs entirely on the developer's computer. It contains no telemetry, analytics, source upload, project identifiers, or migration-time network API. After npm installation, normal scanning and migration work offline using local, versioned compatibility rules.

Filenames and contents are treated as untrusted input. The tool does not execute project files or shell commands, follows no symlinks, bounds file size and URL patterns, and refuses writes outside the selected project.

## Requirements and limitations

- Node.js 22 or newer.
- The tool migrates textual source files, not generated binaries or databases.
- Only syntax covered by Placeholder.photo's verified compatibility implementation is changed automatically.
- Font metrics, antialiasing, watermarking, and static GIF behavior may differ from discontinued services; see the [compatibility guide](https://placeholder.photo/compatibility).
- Unknown parameters, malformed URLs, hostname variants, explicit ports, unsupported formats, and out-of-limit dimensions require manual review.

## Support

- [Placeholder.photo](https://placeholder.photo)
- [Compatibility documentation](https://placeholder.photo/compatibility)
- [GitHub Issues](https://github.com/Jansma-VIP/placeholder-photo-migrate/issues)

## Ownership and license

Built and maintained by Jansma VIP / Placeholder.photo. Released under the [MIT License](LICENSE).
