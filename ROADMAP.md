# Roadmap

## Phase 0 — Discovery and decision record

- Audit the repository, Obsidian version, target Vault conventions, installed community plugins, Claudian availability, and current Codex/OpenCode integration points.
- Research candidate open-source foundations for dashboard composition, fixed-grid drag layout, persistence, and widgets.
- Select or reject candidates using a recorded rubric covering license,
  maintenance, compatibility, architecture fit, and extraction cost. The
  original internal research notes are intentionally excluded from the public
  repository.
- Confirm safe integration boundaries for Claudian, including how it can launch/receive structured workflows and report outcomes.

**Exit criteria:** documented technical foundation decision, integration assumptions verified, and no premature commitment to an unmaintained/incompatible fork.

## Phase 1 — Plugin shell and dashboard foundation

- Establish `plugin/` build/test/lint conventions and the minimal Obsidian plugin lifecycle.
- Implement semantic Light/Dark tokens, red–purple visual language, toolbar navigation, and page shell.
- Build a widget registry, fixed-size widget contracts, draggable persisted layout, loading/empty/error states, and settings storage.
- Ship basic local-only widgets such as date/time, quick links, commands, and daily quote.

**Exit criteria:** Home/Study/Research/Agent pages render reliably; widgets move and persist; no external plugin is required.

## Phase 2 — Vault data adapters and academic widgets

- Implement metadata schema recommendations and field-mapping settings.
- Add robust Vault adapters for recent notes and recent papers.
- Add calendar/today task adapters with native fallback; add Tasks adapter when present.
- Add course-note, paper-reading, and book-reading default templates plus customization/selection settings.
- Add local Obsidian activity heatmap and a local-first GitHub activity data approach with clear availability states.

**Exit criteria:** the dashboard remains useful in a plain Vault and becomes richer when compatible plugins/data are present.

## Phase 3 — Study and research integrations

- Add Spaced Repetition adapter and review/flashcard fallback states.
- Add Bases adapter where supported, without making it mandatory.
- Refine Study and Research pages, filters, navigation, and paper/status displays.
- Test with multiple metadata field mappings and empty/malformed notes.

**Exit criteria:** integrations fail softly, metadata mappings are understandable, and no Vault migration is required.

## Phase 4 — Claudian-powered agent V1

- Implement the Claudian adapter and availability/status model.
- Add selected-agent state and Codex/OpenCode switching.
- Implement the bounded workflows with current-note/Vault context handoff.
- Provide a minimal Agent Widget/entry point and clear handoff status.
- Add lightweight write logging, configurable 30-day retention, and periodic cleanup.

**Exit criteria:** agent actions execute through Claudian only; conservative write boundaries and logs are verifiable; V1 does not pretend to manage provider/model credentials.

## Phase 5 — Polish and release readiness

- Improve macOS fit, accessibility, performance, keyboard flows, and empty/error states.
- Add test coverage for adapters, settings migrations, layout persistence, and log cleanup.
- Document assisted setup, manual sign-in/API-key steps, privacy, security limitations, and troubleshooting.
- Prepare repository standards: license, contribution guide, screenshots/demo, changelog, and release workflow.

## Phase 6 — Content-safe layouts and constrained resizing

- Repair the Home, Study, and Agent default layouts so Widget geometry follows
  actual content density and no supported default clips or overlaps its primary
  controls.
- Add resize handles in **Edit layout** while retaining the project-owned
  `small`, `medium`, and `large` size vocabulary. Resizing snaps only between a
  Widget's declared supported sizes and persists on the canonical four-column
  layout.
- Provide an equivalent keyboard resize flow, clear editing instructions, and
  visible resize affordances without weakening the accepted focus and
  responsive behavior.
- Migrate legacy default layouts to the content-safe preset while preserving
  custom page arrangements, non-layout settings, hidden Widgets, Agent
  preferences, and the write-handoff log.
- Re-run release, clean-archive, security-boundary, installed-plugin, and real
  Obsidian verification without performing an Agent write or modifying Vault
  notes.

**Exit criteria:** the reported Home, Study, and Agent clipping/overlap cases
are resolved; mouse and keyboard resizing are bounded, persistent, and
accessible; custom layouts and plugin data migrate conservatively; and no new
network, subprocess, Git, credential, Provider/Model/Auth, or Vault-write
capability is introduced.

## Phase 7 — Conservative write infrastructure

- Define project-owned, conservative contracts for one Markdown task toggle,
  one review-date marker update, one paper `status` or `favorite` scalar
  update, and one Daily/Course/Paper note creation.
- Add a fail-closed compare-before-write service that fingerprints the exact
  pre-state, rechecks it at commit time, rejects ambiguous or structurally
  unsafe targets, and exposes session-only conditional Undo.
- Validate every destination as a non-hidden Vault-relative Markdown path;
  forbid traversal, absolute paths, `.obsidian`, overwrite, delete, move,
  batch operations, and path changes between preview and commit.
- Advance plugin settings conservatively for Daily Note creation, paper write
  mappings, a SecretStorage reference for future GitHub access, local write-log
  retention, and English/Simplified Chinese locale resources with English
  fallback. Do not perform a GitHub request or persist a PAT.
- Keep local write logs content-free and bounded to timestamp, operation type,
  Vault-relative path, outcome, and a finite error code.

**Exit criteria:** the shared contracts and fake/temporary-Vault integration
tests prove conflict detection, narrow targeting, conditional session Undo,
no-overwrite creation, safe migration from schema 4 with layout schema 3 and
all existing preferences/logs preserved, fail-soft optional capabilities, and
the absence of new network, subprocess, Git, Agent-runtime, or Widget action
behavior.

## Phase 8 — Home actions

- Add explicit review and confirmation for one verifiable Native Markdown task
  completion, with current-session conditional Undo.
- Open existing daily notes from Calendar; for a missing date, preview one safe
  Vault-relative path and bounded content before exclusive creation.
- Add Home course-note, paper-reading-note, and book-reading-note entry points using the same
  review-first, exclusive-create service as the command palette.
- Keep Tasks-plugin results read-only unless the adapter uses the Native
  Markdown fallback; do not call private Community Plugin write APIs.

**Exit criteria:** all three Home action types reuse the Phase 7 conservative
write contract, fail closed on conflicts or races, never overwrite, keep logs
content-free, and pass clean-archive plus read-only real Obsidian acceptance.

## Phase 9 — Study review actions and GitHub contributions

- Add bounded Native Markdown review-date choices on Study with exact marker
  preview, explicit confirmation, compare-and-swap, content-free logging, and
  session-only conditional Undo.
- Keep Spaced Repetition optional and fail-soft. Connect only through a reviewed
  documented public capability; do not call plugin internals or infer APIs from
  versions.
- Store a GitHub PAT only in Obsidian SecretStorage and query the fixed GitHub
  GraphQL endpoint for `viewer` public contributions.
- Optionally include only GitHub's anonymous private contribution count after
  explicit user opt-in with `read:user`; never request `repo`, repository nodes,
  or private repository names.
- Retain at most one normalized year, treat cache as stale after six hours,
  refresh on stale open or manually, and preserve last-good data with explicit
  last-updated/stale/error states.

**Exit criteria:** Study writes still use the Phase 7 single-marker contract;
PAT values never enter plugin data/logs/cache/diagnostics; the only remote URL
is `https://api.github.com/graphql`; optional integrations and refresh failures
fail softly; and clean-archive plus read-only Obsidian acceptance pass.

## Phase 10 — Conservative Research paper actions

**Status:** Accepted. The public evidence is the Phase 10 source, automated
tests, changelog entry, and release checks; the path-specific internal
verification report is intentionally excluded from this repository.

- Add one-click, single-paper `status` selection and `favorite` toggle using the
  accepted schema-5 mappings and Phase 7 conservative-write service.
- Treat the selected action as explicit authorization, then expose
  session-only conditional Undo without a second confirmation modal.
- Replace an existing simple top-level scalar in place or insert one missing
  mapped scalar into an otherwise valid top-level frontmatter block; never
  reserialize or normalize unrelated YAML.
- Fail closed for absent/malformed frontmatter, duplicate/complex fields,
  concurrent edits, moved targets, stale actions, or unsupported values.
- Keep Research local to existing Vault paper notes and keep Bases or other
  optional sources out of the write path.

**Exit criteria:** one action can affect only one paper and one mapped scalar;
unrelated note bytes are preserved; compare-and-swap, postcondition checks,
minimal logging, conditional Undo, clean-archive, and read-only real-Obsidian
acceptance pass; and no new network, Agent, plugin-internal, or broad-write
capability is introduced.

## Phase 11 — Product-wide polish, localization, and accessibility

- Complete a feature/state audit across Home, Study, Research, Agent, Settings,
  and layout editing, covering loading, empty, fallback, unavailable, stale,
  success, conflict, and error states.
- Refine Agent information hierarchy while retaining Claudian 2.1.3
  open/prefill/manual-send and evidence-backed status wording.
- Finish content-safe four/two/one-column presentation, toolbar compaction,
  translated-label containment, focus order, and non-persisting responsive
  projections.
- Route every user-visible string through complete English and Simplified
  Chinese resources, automatically follow Obsidian locale, and use English
  fallback plus locale-aware date/time/count formatting.
- Verify full keyboard operation, focus restoration, screen-reader labels/live
  regions, non-color states, reduced motion, contrast, and forced-colors
  behavior.

**Exit criteria:** all accepted functions have intentional states and recovery;
English/Simplified Chinese coverage is complete; Agent, GitHub, write, layout,
and optional-dependency boundaries remain unchanged; responsive and
accessibility regressions pass; and clean-archive plus read-only Obsidian
acceptance succeed.

## Phase 12 — Theme-aware Dashboard visual system

- Audit the accepted Dashboard in Default Light/Dark and unrelated themes, then
  extract only visual roles from the implemented PaperPulse macOS reference.
- Preserve the four-page information architecture and feature behavior while
  refining color, material, typography hierarchy, spacing rhythm, border,
  shadow, radius, and interaction states.
- Replace component raw colors with a documented
  `--academic-dashboard-*` semantic token layer that falls back entirely to
  Obsidian theme variables, Light/Dark, and Accent Color.
- Cover every Widget, data state, action, form, modal, settings section,
  edit-layout affordance, locale, responsive mode, focus/contrast mode, and
  transparency fallback.
- Publish a stable theme-author contract for the independent PaperPulse
  Academic theme without making that theme mandatory.

**Exit criteria:** Academic Dashboard looks coherent under default and unrelated
Obsidian themes; all component roles use semantic fallbacks and documented
hooks; behavior, permissions, persistence, localization, and accessibility stay
intact; and matched visual QA, clean-archive, and real Light/Dark acceptance
pass.

## Phase 13 — Book notes and related-material routing

**Status:** Implemented locally; not yet released.

- Add a third academic template and command for book-reading notes, defaulting
  to the `Reading` root with `type: book-note`.
- Default academic roots to `Course`, `Paper`, and `Reading`, and default the
  Daily Quote source to the Vault-root `每日引言.md`.
- Before course, paper, or book creation, recursively search its configured root
  for exact or complete-title-prefix folder/file matches. Reuse one clear
  related directory; otherwise create `<root>/<title>/<title>.md`.
- Fail closed on competing best destinations and retain exclusive create: never
  move, rename, modify, or overwrite existing material.
- Add a Claudian book-note workflow. Treat all three single-note creation
  handoffs as explicitly authorized after the user presses Send, so path checks
  are followed by one creation without a second plan/diff approval.
- Migrate schema 5 to schema 6 without discarding layouts, metadata, local or
  Agent write logs, GitHub settings/cache metadata, locale, or existing course
  and paper template customizations.

**Exit criteria:** local and Claudian creation share the documented grouping
rules; ambiguous and existing destinations fail closed; schema-5 preservation,
all unit tests, lint, typecheck, release checks, and installed-plugin smoke
verification pass; no existing paper/PDF is moved or modified.

## Independent follow-on — PaperPulse Academic Obsidian theme

- Maintain PaperPulse Academic as an independent MIT-licensed sibling
  repository with its own Git history and releases.
- Implement a complete PaperPulse-inspired Dark scheme and a separately
  designed warm-paper, low-saturation red-purple Light scheme.
- Cover the Obsidian shell, sidebars, tabs, ribbon, overlays, command palette,
  settings/forms, editor/reader, Properties, Bases, Canvas, Graph, and Academic
  Dashboard while honoring Accent Color.
- Keep Style Settings optional and ensure the default theme is complete without
  it; include no JavaScript, runtime dependency, network request, remote font,
  remote asset, telemetry, or automatic Vault/configuration mutation.
- Install by copying theme assets to `.obsidian/themes/PaperPulse Academic` but
  leave selection to the user; do not automatically push, publish, submit to
  Community Themes, or modify unrelated `.obsidian` settings.

**Exit criteria:** both schemes and the complete acceptance matrix pass in real
Obsidian; Dashboard integration uses the public Phase 12 variables; the theme
works without optional plugins; installation and source hashes are documented;
and the independent repository ends at a clean acceptance commit.

## Later / explicitly out of V1

- Full Dashboard-managed Agent → Provider → Model switching.
- Additional providers beyond OpenAI and DeepSeek.
- Remote/synced GitHub heatmaps by default.
- Free-form pixel resizing and complex multi-device layout synchronization.
- Autonomous bulk Vault maintenance.
