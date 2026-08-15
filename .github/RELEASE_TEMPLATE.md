# Academic Dashboard VERSION

## Highlights

- Describe the primary user-visible changes.

## Compatibility

- Obsidian Desktop: `MIN_VERSION` or later
- Claudian: accepted compatibility version and known limitations
- Optional integrations: Tasks, Spaced Repetition, Bases (fail-soft)

## Verification

- [ ] Clean archive: `npm ci --ignore-scripts`
- [ ] Typecheck/build, lint, and full tests
- [ ] Production dependency and vulnerability audit
- [ ] Bundle contains the three runtime assets and license notices
- [ ] Static network/subprocess/credential/path scan
- [ ] Real Obsidian read-only acceptance with installed `data.json` retained

## Installation

Copy `main.js`, `manifest.json`, and `styles.css` from this release into
`<vault>/.obsidian/plugins/academic-dashboard/`. Retain the existing `data.json`.

See `CHANGELOG.md`, `docs/setup.md`, and `docs/privacy-security.md` before
upgrading.
