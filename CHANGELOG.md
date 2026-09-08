# Changelog

All notable changes are documented here. This project follows Keep a Changelog
structure and Semantic Versioning.

## [Unreleased]

## [0.3.0] - 2026-09-08

### Added

- Configurable book-note type, edition, and stable reading-ID metadata mappings
  as the identity foundation for the unified reading queue.
- Unified Research reading queue for papers and books, with plugin-side status,
  manual ordering, next-step text, and page/chapter/stage position. Rename
  recovery uses unique stable IDs or edition-aware signatures.
- Cancellable, read-only academic material diagnostic command with active mapping
  preview, categorized counts, and bounded issue samples.
- Home task window grouped into overdue, today, and the next seven days, using
  the configured Daily Note path for undated tasks.
- Up to three persisted Today Focus references for tasks, course notes, or
  reading notes, with missing-reference states and task-row pin controls.
- Study Course Overview with exact course/term separation, explainable metadata
  or root-folder association, and links to notes, resources, due tasks, and due
  reviews. Ambiguous shared resources remain unresolved.
- Bounded Study review sessions with course/type selection, 10/20-item limits,
  distinct viewed and skipped outcomes, source opening, and exact-target Native
  review-date updates.
- Saved and pinned Research views for keyword, year, status, and exact-tag
  filters; 10-item pagination with bounded visible counts; and explainable
  related material from explicit mapped links or shared tags.
- Editable Home weekly review drafts with an explicit local date range, linked
  modified notes, retained local-write and Agent-handoff evidence, and written
  data-limit notes. Confirmation exclusively creates a new Markdown file and
  refuses an existing or concurrently created destination.
- Two-step Agent handoff preview showing workflow, target, related paths,
  resolved creation destination, access boundary, and prepared character counts
  before Claudian is opened. The five newest minimal request records support
  restoring a workflow/target and manual unverified completion without storing
  request text or claiming execution signals.
- Book-reading note template, Home/command entry point, and Claudian workflow,
  with `Reading` as the default root and `type: book-note` metadata.
- Related-material lookup for course, paper, and book creation: reuse one clear
  matching directory or create `<root>/<title>/<title>.md`; ambiguous matches
  fail closed and existing files are never moved or overwritten.
- Vault-local Markdown sourcing for the Daily Quote Widget, with a settings
  action that opens the configured file directly in Obsidian.
- Immediate single-paper Research status choices and favorite toggle with
  content-safe mapped scalar writes and current-session conditional Undo.
- Research paper write-field settings with explicit scalar-format guidance.
- Review-first completion for one Native Markdown task with exact-line preview,
  explicit confirmation, and current-session conditional Undo.
- Missing Daily Note, course-note, and paper-reading-note Home actions with one
  Vault-relative path and bounded content preview before exclusive creation.

### Changed

- Settings schema 7 migrates schema 6 intact and adds finite Agent request
  evidence states plus an optional bounded prepared-character count.
- Settings schema 6 preserves schema-5 state while adding book-note settings.
  Default roots are now `Course`, `Paper`, and `Reading`, and the default quote
  file is the Vault-root `每日引言.md`.
- Claudian course, paper, and book creation requests no longer ask for a second
  plan/diff confirmation after the user sends them; other write-capable
  workflows remain review-first.
- Conservative paper transforms now preserve line endings, replace existing
  simple scalars in place, and insert a missing mapped scalar only into an
  otherwise safe existing top-level frontmatter block.
- Course and paper command-palette creation now requires the same explicit
  path/content review used on Home.
- Tasks-plugin results stay read-only unless the adapter uses the verifiable
  Native Markdown fallback; no private Community Plugin write API is called.

### Fixed

- Native task and review parsing now shares a length-aware Markdown fence
  scanner, and task edits preserve original line separators byte for byte.
- Claudian course, paper, and book creation handoffs now receive a single path
  resolved by Dashboard through Obsidian's Vault API. They no longer deadlock by
  requiring a recursive scan while Shell access is forbidden, and Dashboard
  stops before handoff on an ambiguous or existing destination.

### Security

- Native task and review write requests now bind to the exact source-document
  fingerprint and original target line observed by the list adapter. Changes
  before preview fail closed instead of selecting the new occupant of a line.
- Saved settings from a newer schema now enter a protected compatibility
  state. Automatic migration, log cleanup, layout edits, settings changes, and
  unload flushing cannot overwrite the newer `data.json`.
- Research actions bind to the list-observed scalar and mapped paper identity,
  use complete-content compare-and-swap, serialize per path, and reject stale,
  moved, malformed, duplicate, nested, multiline, tagged, aliased, or complex
  targets without calling an optional plugin write API.

## [0.2.0] - 2026-08-12

### Added

- Project-owned prepare/commit contracts for one task toggle, review-date
  marker, paper status/favorite scalar, or note creation at a time.
- Exact pre-state fingerprints, atomic compare-before-write, postcondition
  verification, and conditional session-only Undo for edit operations.
- Settings schema 5 foundations for Daily Notes, paper write fields, a future
  GitHub SecretStorage reference, content-free local write logs, and English /
  Simplified Chinese resources with English fallback.

### Changed

- Existing course and paper note commands now prepare an immutable relative
  path/content preview contract and use exclusive, verified creation.
- Plugin data migration preserves layout schema 3, hidden Widgets, metadata,
  templates, local Widget preferences, Agent selection, retention, and prior
  handoff logs while adding safe Phase 7 defaults.

### Security

- Write ports expose no delete, move, batch, network, Git, shell, or Agent
  capability and reject traversal, absolute, hidden, `.obsidian`, and configured
  Obsidian settings-directory targets.
- Concurrent edits, changed previews, duplicate frontmatter fields, malformed
  or complex target values, and stale Undo fail closed without overwrite.
- Local write logs retain only time, operation, relative path, finite outcome,
  and finite error code; note content, scalar values, prompts, secrets, tokens,
  and absolute paths are discarded.

## [0.1.1] - 2026-08-12

### Added

- Constrained pointer resizing in Edit Layout with visible bottom-right handles.
- Equivalent Shift+Arrow keyboard resizing and announced editing instructions.

### Changed

- Home, Study, and Agent now use content-safe default card geometry instead of
  clipping long lists, filters, calendars, heatmaps, or Agent guidance.
- Layout schema 3 safely upgrades legacy defaults and repairs undersized custom
  cards while retaining safe coordinates and all non-layout plugin data.

### Fixed

- Removed the overlapping Agent default composition and undersized status and
  approved-workflow cards.
- Expanded the first two Study cards and compacted the unavailable GitHub card.
- Rebalanced Home so compact controls and content-heavy cards use appropriate
  one-row and two-row sizes.

## [0.1.0] - 2026-08-12

### Added

- Four-page macOS-first Dashboard shell with fixed-size draggable Widget layouts
  persisted per Vault.
- Plain-Vault date/time, shortcuts, commands, quote, calendar, tasks, recent
  notes/papers, activity, academic templates, and native review queue.
- Capability-detected Tasks, Spaced Repetition, and Bases integrations with
  explicit Native or unavailable fallbacks.
- Metadata mappings, Study/Research filters, keyboard layout movement, and
  accessible non-color status presentation.
- Six conservative Claudian workflow entry points, Codex/OpenCode preference,
  review-first prefill, and retained minimal write-handoff metadata.
- Read-only setup diagnostic and installation, privacy, security, release, and
  troubleshooting documentation.

### Security

- No Dashboard runtime networking, subprocess, Git, provider credential, model,
  or direct Codex/OpenCode execution surface.
- Optional-plugin results, settings, layouts, templates, paths, workflow inputs,
  and write-log records are bounded and validated at project-owned contracts.
