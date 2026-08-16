# Project Brief — Obsidian Dashboard

## Mission

Build a personal academic dashboard plugin for Obsidian, designed for macOS first and engineered to become an open-source-quality project. It provides a calm, widget-based workspace for study and research, plus a safe entry point to Claudian-powered agent workflows.

The project is an independent Git repository. Documentation remains at the
repository root and in `docs/`; implementation lives under `plugin/`. A user
Vault is never part of this repository.

## Non-negotiable architecture decisions

1. **Claudian is the only agent execution runtime/interface.** The dashboard must invoke agent work through Claudian and must not implement a second agent runtime.
2. **Codex and OpenCode are selectable agent targets.** Users may freely switch between them. V1 exposes the agent selection only; each selected agent retains responsibility for its provider, model, authentication, and local configuration.
3. **V1 providers are OpenAI and DeepSeek.** Provider/model controls belong to the underlying agent in V1. A later phase may expose Agent → Provider → Model selection in the dashboard where Claudian and the target tools support it.
4. **macOS is the acceptance platform, not a platform lock.** UX should feel native on macOS, while filesystem, commands, installation, and UI architecture remain portable.
5. **Adapters isolate optional plugin dependencies.** Tasks, Spaced Repetition, Bases, and future sources are optional integrations with clear capability detection and graceful fallback.
6. **Vault safety wins over automation.** Full-Vault reading is permitted by default. Writes are conservative, previewable where feasible, logged, and never used for unrequested bulk changes.

## Dashboard experience

### Visual direction

- macOS Widget aesthetic: rounded surfaces, depth, deliberate spacing, compact but readable information density.
- Red–purple gradient brand language.
- A deliberately mixed Light/Dark design system, implemented through semantic design tokens rather than hard-coded component colors.
- Top toolbar with pages: **Home**, **Study**, **Research**, **Agent**. Icons are provisional and replaceable.
- Architecture and interaction quality take priority over retaining any upstream project’s visual design. Open-source foundations may be reused, forked, or adapted only after evaluation.

### V1 layout behavior

- Widgets are draggable and use a set of fixed supported sizes; no free-form resizing is required for V1.
- Layout is persisted per Vault/user in plugin data.
- Widget failures are contained: one unavailable source should render an informative empty/fallback state, not break the page.

### Home dashboard content

Home should support the following widgets, with ordering/layout configurable over time:

- Date and time
- Calendar
- Today’s tasks
- Recent notes
- Quick links / shortcuts
- Recent papers
- Due reviews / flashcards
- Local-first Obsidian and GitHub activity heatmaps
- Agent entry point
- Codex/OpenCode status and switcher
- Frequently used commands
- Daily quote

“Recent papers” only reads existing Vault notes identified by a configurable metadata mapping (recommended default: `type: paper`). It must not scrape the web or create research records implicitly.

## Data and metadata

Use a recommended metadata schema plus user-configurable field mappings. The plugin should work with common variations without forcing a Vault migration.

Suggested defaults:

```yaml
# course note
type: course-note
course: ""
term: ""
date: 2026-08-11
tags: []

# paper note
type: paper
title: ""
authors: []
year: null
status: unread # unread | reading | reviewed
venue: ""
doi: ""
tags: []

# book-reading note
type: book-note
title: ""
authors: []
status: reading
date: 2026-08-11
tags: []
```

V1 includes editable default templates for course notes, paper-reading notes,
and book-reading notes. Users may point to their own templates or customize the
bundled defaults. Creation searches the configured root for a related folder or
file before choosing a path; no-match creation uses a title-named folder, while
ambiguous destinations and existing targets fail closed.

## Agent workflows

Offer structured entry points that pass context to Claudian, while allowing the chosen target agent to perform the work:

1. Organize/polish the current note
2. Summarize the current note
3. Check and repair Markdown
4. Search the full Vault and answer a question
5. Create a course note
6. Create a paper-reading note
7. Organize today's Daily Note into existing academic notes
8. Create a book-reading note

The Dashboard’s Agent page eventually becomes a complete Agent Widget. It is staged deliberately: V1 focuses on invoking Claudian and switching Codex/OpenCode; subsequent phases enrich status, prompts, history, provider/model controls, and review UX.

## Safety and auditability

- Default access: read the whole Vault.
- Never delete notes, bulk rewrite/restructure content, or modify `.obsidian` without explicit user instruction/approval.
- Treat multi-file writes, destructive changes, command execution, and configuration edits as higher risk.
- Make generated writes narrow and attributable. Existing-note Agent writes
  remain review-first. A user-sent course/paper/book creation request may create
  exactly one note after fail-closed path checks without a second confirmation.
- Record lightweight logs for every agent write: timestamp, requested workflow, selected agent, affected paths, outcome, and minimal error information. Do not log full note contents or secrets.
- Retain logs for 30 days by default; make retention configurable and periodically clean expired entries.

## Installation principle

Provide an assisted setup script for discovery, validation, and setup guidance. Authentication remains manual: the user signs into Codex/OpenCode/Claudian or enters API keys through the appropriate trusted UI/configuration flow. Scripts must not capture, print, or persist secrets unnecessarily.

## Quality bar

Start as a personal tool, but make interfaces, documentation, settings, error states, accessibility, tests, and licensing decisions appropriate for a future public release. Do not assume installed community plugins, a particular Vault taxonomy, or a single operating system.
