# Architecture

## System shape

```text
Obsidian UI
  └─ Dashboard shell (toolbar + pages)
      └─ Widget registry / layout service
          ├─ Vault data adapters
          │   ├─ Native Vault + metadata mapping
          │   ├─ Tasks (optional)
          │   ├─ Spaced Repetition (optional)
          │   └─ Bases (optional)
          ├─ Local activity adapters
          │   ├─ Obsidian activity
          │   └─ GitHub activity (local-first)
          └─ Claudian adapter
              └─ selected target: Codex | OpenCode

Agent writes → safety policy → write log store → retention cleanup
```

Phase 7 adds a separate Dashboard-local write path for approved single-item
actions. It does not pass through Claudian and must not be confused with an
Agent handoff:

```text
Explicit Dashboard action
  -> prepare exact single-target preview
  -> user confirmation (later action phases)
  -> reread + compare exact pre-state
  -> atomic one-file edit or exclusive create
  -> verify post-state
  -> content-free local log + session-only conditional Undo
```

## Layers

### Presentation

Pages own composition, not data acquisition. Each widget receives a view model plus explicit loading, empty, unavailable, and error states. Use a semantic token system for mixed light/dark surfaces and red–purple accents. Widget IDs, titles, icons, supported fixed sizes, capability requirements, and settings belong to a registry.

### Application services

Services coordinate layout persistence, widget capabilities, settings, metadata mapping, template resolution, time/date formatting, and agent workflows. They transform adapter results into stable widget view models. They do not reach directly into community plugin APIs.

### Adapters

Adapters encapsulate all external contracts. Each exposes availability/capabilities and stable project-owned types. Implement native fallback adapters first, then optional plugin adapters. A missing plugin returns an intentional unavailable/fallback result, never a startup failure.

### Infrastructure

Use Obsidian-approved storage/lifecycle APIs for plugin settings and data. Keep agent logs separate from content. Retention cleanup should run on safe lifecycle points (startup and/or a low-frequency scheduled check) without blocking the UI.

## Key contracts (conceptual)

```ts
type Availability =
  | { status: 'available'; source: AdapterSourceKind }
  | {
      status: 'fallback';
      source: AdapterSourceKind;
      reason: string;
      fallbackAdapterId: string;
    }
  | {
      status: 'unavailable';
      source: AdapterSourceKind;
      reason: string;
      recovery?: string;
    };

interface DataAdapter<TQuery, TResult> {
  readonly id: string;
  availability(): Promise<Availability>;
  query(input: TQuery): Promise<TResult>;
}

interface AgentAdapter {
  availability(): Promise<Availability>;
  open(): Promise<AgentHandoffResult>;
  handoff(request: AgentWorkflowRequest): Promise<AgentHandoffResult>;
}
```

Phase 2 adopts these project-owned `DataAdapter` and explicit availability
states. Widgets depend on project contracts, and only adapters know Obsidian or
third-party APIs. A service may choose a declared fallback adapter; a missing
optional plugin is never represented as an exception during startup.

## Metadata mapping

Store a recommended schema and per-field mappings in settings. For example, a Paper adapter should ask the mapping service which field denotes note type and which value means a paper; it should not hard-code `type === 'paper'`. Defaults aid new users, mappings respect existing Vaults.

Metadata mappings introduced in settings schema version 2 store note type,
course, term, date, title, authors, year, reading status, venue, DOI, and tags,
plus configurable course-note and paper discriminator values. Version 1 settings
migrate by adding the recommended mapping while retaining all layouts and Phase
1 preferences. Changing a mapping changes future reads only; it does not edit or
migrate notes.

The Phase 2 Native Vault port lists Markdown file metadata and reads parsed
frontmatter through Obsidian's metadata cache. The recent-notes adapter sorts
bounded file records by modification time. The recent-papers adapter filters the
same records through the configured note-type field/value and exposes only
mapped summary fields. Neither adapter reads note bodies, writes notes, or calls
an external service.

Calendar and Today Tasks also have Native Vault baselines. Calendar identifies
existing daily notes by an ISO `YYYY-MM-DD.md` basename and never creates a
missing date note. The Native Markdown task adapter parses incomplete checkbox
items outside fenced code blocks; it includes tasks explicitly due today and
undated tasks located in today's daily note. Individual unreadable files are
skipped so a transient file race cannot fail the Widget.

The optional Tasks adapter owns Community Plugin detection and a future
compatible query capability. No project-reviewed public read query is currently
assumed from Tasks internals: missing or installed-but-unsupported versions
declare `fallback` and delegate to the Native Markdown adapter. A compatible
capability or runtime failure remains isolated inside that adapter.

Settings schema version 3 introduced course-note and paper-reading template
settings. Schema version 6 adds book-reading settings and migrates schema 5
without discarding existing template customizations, layouts, mappings, logs,
GitHub settings/cache metadata, or locale. Each template may use editable
Dashboard-owned Markdown or a selected Vault Markdown template, with a
validated Vault-relative root. The creation service resolves only documented
placeholders, rejects unsafe filenames and hidden or traversing paths, and
searches that root recursively for related folder/file names. One clear match
selects its directory; no match creates `<root>/<title>/<title>.md`; competing
best directories fail closed. Exclusive creation calls `Vault.create` exactly
once, and existing material is never moved, changed, or overwritten. The three
user-triggered commands are local creation actions; they do not invoke Claudian
or an Agent runtime.

Local Obsidian activity uses only the latest filesystem modification timestamp
for each Markdown note, grouped into local calendar days. It is a contribution
summary, not a complete historical edit log, and never reads note bodies. The
Phase 9 replaces the former unavailable GitHub placeholder with one reviewed
remote adapter. A narrow Obsidian port owns the fixed
`https://api.github.com/graphql` endpoint and `requestUrl`; callers cannot supply
a URL. The constant query asks only for `viewer.contributionsCollection`, public
daily counts, and—behind an explicit Boolean—the anonymous
`restrictedContributionsCount`. It has no repository field and no Git,
subprocess, OAuth, Device Flow, or custom-endpoint path.

Phase 3 adds a Native review-queue adapter that reads only explicit review and
flashcard markers from Markdown, ignores fenced examples and generated/hidden
paths, and contains individual read/cache failures. The optional Spaced
Repetition adapter uses only a compatible injected read capability; missing,
incompatible, malformed, or throwing integrations delegate to the Native
adapter. The Widget displays the active fallback rather than requiring the
Community Plugin.

Bases integration follows the public custom-view capability. When the runtime
constructor and `registerBasesView` capability exist and Bases accepts the
registration, an Academic Papers view consumes the Base's already filtered and
sorted entries and maps them through Dashboard metadata settings. No internal
arbitrary-query API is guessed. Obsidian versions before Bases and Vaults with
Bases disabled skip registration and retain Native research reads.

Study and Research filters are bounded, local query inputs. Phase 10 adds only
the separately authorized Research status/favorite actions described below;
filters themselves never write. Settings schema version 3 remained sufficient
for Phase 3, while the actions use the schema-5 write mappings.

## Widget layout

V1 widgets use a finite size vocabulary (for example S/M/L and defined grid spans) and drag-to-reorder/move behavior. Persist page-specific layout records keyed by stable widget IDs and schema version. Validate and migrate persisted state; fall back to a default layout if data is invalid.

Phase 6 advances the layout schema to version 3 without exposing GridStack
dimensions in persisted data. A page is replaced with the new content-safe
preset when every record still exactly matches its Phase 5 default. For custom
version-1 and intermediate version-2 pages, coordinates are retained where the
new content-safe minimum sizes fit; only newly colliding cards move downward on
the canonical grid. The
new defaults remove the Agent collision, give calendar/list/review/heatmap
content two rows, and keep compact status/empty content in one row.

Edit mode also enables GridStack's bottom-right resize interaction on the
canonical four-column layout. The adapter derives minimum and maximum spans
from each Widget's project-owned `allowedSizes`, converts a completed resize
back to a validated size token, and rejects unsupported spans. Shift+Arrow is
the keyboard equivalent. Resizing and movement are disabled on responsive
one/two-column reflow so presentation geometry cannot overwrite canonical
state.

Phase 5 creates Widget slots in persisted DOM order and starts independent
Widget lifecycles concurrently. Page navigation owns an `AbortSignal`; a stale
mount may finish its adapter work, but it cannot publish state into the active
page and is destroyed before it can own a layout engine. This does not introduce
background note caching or network work. The page toolbar follows tab-list
keyboard semantics, while layout editing exposes focusable Widgets, arrow-key
movement, Escape-to-exit, and a polite status announcement.

## Agent boundary and safety

Settings schema version 4 adds only the selected Agent target, write-log retention,
and the minimal handoff log. The default target is Codex and the default retention
is 30 days. Existing schema-3 layouts, metadata mappings, templates, and optional
plugin preferences are preserved. Cleanup runs at startup and every six hours;
entries older than the configured 1–3650 day window are removed.

The Dashboard constructs one of eight constrained workflow requests and passes it
only to the Claudian adapter. Claudian owns execution and the selected target
agent (Codex/OpenCode) owns its provider/model/auth configuration. The audited
Claudian 2.1.3 compatibility port can reveal the Claudian view and prefill its
public composer, but cannot reliably switch target, submit, or observe execution
completion. The user therefore verifies the target and explicitly sends. The UI
reports only `ready for review` or `ready to send`, never an invented running or
completed state.

Read-only workflows are not logged as writes. For write-capable workflows, the
Dashboard records only timestamp, workflow id, target, declared Vault-relative
affected paths, handoff outcome, and a bounded error code. Prompt text, note
content, API keys, provider/model/auth data, and absolute paths are not accepted
by the log schema. These records describe Dashboard-to-Claudian handoff attempts;
they are not evidence that Claudian or an Agent changed the filesystem.

No component may silently make broad edits, delete notes, alter Vault structure, or modify `.obsidian`.

The seventh workflow resolves today's Daily Note from the configured folder and
filename format, rather than relying on whichever tab is active. It passes the
validated course/paper/book metadata mappings to Claudian and requests a bounded
routing proposal: source blocks may be appended to at most ten uniquely matched
existing course, paper, or book notes. Ambiguous blocks remain unmatched; the source
Daily Note, frontmatter, Vault structure, and hidden paths remain unchanged.
Dashboard neither reads the source body nor performs these edits itself. The
user reviews the routing table and proposed diffs and explicitly sends/approves
the request in Claudian.

The eighth workflow creates a book-reading note and joins the course/paper
creation workflows in a `direct-write` boundary. The user still verifies the
target and presses Send because Claudian 2.1.3 cannot be submitted through its
public cross-plugin interface. Before the handoff opens, Dashboard performs the
same related-material path preflight through Obsidian's Vault API and supplies
one resolved Markdown path to Claudian. The target must not repeat that scan or
request a directory listing/Shell permission. After Send, these three prompts
authorize exactly one new Markdown note (plus only the parent folder required
by the resolved path) without a second plan/diff approval.
Existing-note and multi-note writes remain `proposed-write` and review-first.

### Conservative local write contract

The Phase 7 write port owns only Markdown `read`, atomic compare-and-swap,
folder preparation for one creation, and exclusive create. It has no delete,
move, rename, recursive, batch, Git, subprocess, network, or Agent method.
Paths must be visible Vault-relative Markdown paths and may not enter the
configured Obsidian settings directory.

Task and review operations identify one exact line. Paper operations identify
one unique frontmatter field and support only the approved status scalar or a
boolean favorite scalar; duplicate fields, malformed YAML, and nested or
complex target values fail closed. Prepare objects are immutable and bound to
one service session. Commit rereads and compares both exact content and its
opaque fingerprint before the port performs an atomic comparison.

Edit Undo state retains the exact before/after content only in memory and is
discarded on unload/restart. Undo compares the entire current note with the
Dashboard-written post-state, so any later user edit makes Undo unavailable.
Creation has no delete-style Undo. Existing course/paper/book creation commands use
the same preview and exclusive-create core; Phase 7 adds no Widget action.

Settings schema version 5 adds validated Daily Note defaults, paper write field
names, a future GitHub SecretStorage reference name plus cache metadata, local
write-log retention, and locale resource selection. It never stores a GitHub
PAT. English and Simplified Chinese resource catalogs exist for later action
surfaces, with English as the fallback; Phase 7 does not rewrite the full UI.

Settings schema version 6 adds the book-reading template and preserves all
valid schema-5 fields during migration. New defaults use `Course`, `Paper`, and
`Reading` as academic roots and `每日引言.md` at the Vault root as the quote file.

Phase 8 surfaces a deliberately small Home action layer over the same service.
Today's Tasks enables completion only while the active adapter declares the
Native Markdown fallback, then prepares the exact one-based source line and
requires a before/after confirmation. Returned Undo tokens remain in the
plugin's in-memory session, including across Dashboard page remounts, and are
discarded on unload. Optional Tasks results with a supported read query remain
read-only because Dashboard has no reviewed third-party write contract.

Calendar dates with an existing ISO-named note still open that note. A missing
date resolves one destination and template from validated Daily Note settings,
shows its Vault-relative path and bounded content, and confirms through the
exclusive-create contract. The same review modal is used by the Home course,
paper, and book entry points and their command-palette equivalents. Creation never gains
a delete-style Undo.

Phase 9 surfaces the existing `review-date` operation on Study only for a Native
review item whose parser found exactly one supported marker and retained its
original one-based line. Four bounded future dates lead to the shared exact
before/after modal and `ConservativeWriteService`. Optional-plugin results never
receive a Dashboard write target. Review Undo tokens share the same in-memory
session and whole-post-state comparison as task Undo.

Phase 10 exposes paper status and favorite actions only for existing Native
Vault paper records. The list view model carries the configured paper identity,
the exact observed scalar state, and distinct read/write field mappings. A click
is explicit authorization and prepares plus commits immediately through the
same service without a confirmation modal. Prepare rereads the complete note,
requires that it is still the mapped paper and that the observed scalar has not
changed, then replaces one supported top-level scalar or inserts one missing
line immediately before a safe frontmatter closing delimiter. It never creates
frontmatter, reserializes YAML, or calls Bases or another plugin to write.

Research actions are serialized per Vault-relative path in the Widget and remain
protected by whole-content compare-and-swap in the service. Verified commit and
conditional Undo refresh the Native paper list; destroyed/stale Widget
generations cannot publish completion. Paper Undo tokens are stored only in the
loaded plugin session and are cleared on unload with task/review Undo state.

GitHub credentials use Obsidian's public `app.secretStorage` API, available from
Obsidian 1.11.4. Settings store only the validated secret ID, explicit private
count preference, non-sensitive credential revision, and normalized cache.
Changing the PAT advances that revision and clears the prior viewer cache; an
in-flight response with an older revision is discarded. A cache contains at
most 366 date/count pairs, its range and timestamp, and optionally one anonymous
private total. Six-hour freshness also requires matching credential revision,
date coverage, and private-count preference. Stale data renders immediately,
one refresh runs at a time, and failures retain last-good data plus a finite
error code.

## Release boundary

The installable runtime remains `main.js`, `manifest.json`, and `styles.css`.
Release archives also carry the project license and third-party notices, never a
Vault's `data.json`. CI builds from the lockfile, runs the complete verification
suite, validates the version tag, and grants release write permission only to
the tag-gated release job. CI networking and GitHub release publication do not
add a network, Git, or subprocess capability to the installed plugin.
