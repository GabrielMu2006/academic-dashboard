# Setup and Installation

Academic Dashboard is a desktop Obsidian plugin. Its local Widgets work in a
plain Vault. Claudian, Tasks, Spaced Repetition, and Bases are optional; missing
or incompatible integrations show an explicit fallback instead of blocking the
Dashboard.

Academic Dashboard 0.3.0 requires Obsidian 1.11.4 or newer because GitHub
credentials use the public SecretStorage API. The acceptance target remains
Obsidian Desktop 1.13.6.

## Install a release

1. Download `main.js`, `manifest.json`, and `styles.css` from one Academic
   Dashboard release.
2. Create `<vault>/.obsidian/plugins/academic-dashboard/` if it does not exist.
3. Copy those three files into that directory. Do not copy a `data.json` from a
   release or another Vault.
4. In Obsidian Desktop, open **Settings → Community plugins**, enable
   **Academic Dashboard**, then run **Academic Dashboard: Open dashboard**.

Updating uses the same three-file copy. Retain the installed `data.json`; it
contains this Vault's Dashboard settings, layouts, and minimal write-handoff
and local-write logs. Phase 7 migration preserves the installed file and adds
safe defaults; it does not require copying a replacement `data.json`.

## Build from source

Node.js 22 or later and npm are required:

```sh
cd plugin
npm ci
npm run build
```

Install only `plugin/main.js`, `plugin/manifest.json`, and
`plugin/styles.css`. The production plugin has one bundled dependency,
GridStack 13.0.2. Building Claudian from source is a separate process and is not
required.

## Optional GitHub contributions

1. Create a GitHub personal access token for your own account. Public viewer
   contributions need no repository scope.
2. In **Settings → Academic Dashboard → GitHub contributions**, paste the token
   and choose **Save securely**. The value is written only to Obsidian
   SecretStorage; it is never copied into plugin `data.json`.
3. Leave **Anonymous private contribution count** off for public contributions
   only. If you explicitly enable it, grant `read:user`. Do not grant `repo`:
   Dashboard neither needs nor requests repository access or names.
4. Open Study. A cache is fresh for six hours. Stale last-good data renders
   while refresh runs, and **Refresh** is always available manually.

Dashboard uses only `https://api.github.com/graphql`. It has no OAuth, Device
Flow, JSON import, or custom API address. Replacing the PAT clears the previous
viewer cache.

## Local daily quote file

The Daily Quote Widget can read a visible Markdown file inside the current
Vault. In **Settings → Academic Dashboard → Local quotes**, enter a
Vault-relative path such as the default `每日引言.md` at the Vault root, save it, and choose
**Open file** to edit it in Obsidian. Each non-empty, non-heading line is one
quote, up to 366 entries (enough for a leap year); Markdown bullets,
numbered-list prefixes, and blockquote markers are removed. YAML frontmatter
and HTML comments are ignored. The Widget reloads the file periodically,
selects one entry deterministically per local calendar day, and never uses a
network quote service.

The settings page retains the original local quote list as a compatibility
fallback. It is used only when the quote-file path is empty. A missing or empty
configured file is reported explicitly instead of silently switching sources.

## Today task window and focus

The Home task Widget groups incomplete Native Markdown tasks into **Overdue**,
**Today**, and **Next 7 days**. A task appears in only one group. Undated tasks
are included in Today only when they are inside the exact Daily Note path built
from **Daily Note folder** and **Filename format** in Settings. The Widget
refreshes just after local midnight and keeps the existing review-first task
completion and conditional Undo behavior.

Choose the star on a task to add or remove it from Today Focus. To focus a
course or reading note, use **Settings → Academic Dashboard → Today focus** and
enter up to three lines as `Label | relative/path.md`; a task reference may add
its exact line as a third value. Missing notes and completed or moved task lines
remain visible as unavailable references so they can be corrected rather than
silently discarded.

## Course overview

The Study **Course Overview** groups material by the mapped course and term
fields. Set **Current term** in Dashboard settings to an exact term value such
as `2026 Fall` when the same course name appears in several terms. Notes with
explicit mapped metadata take priority. Visible files directly below the
configured course root are associated through their first child folder only
when that association is unambiguous; shared-root resources stay unresolved
when several terms could own them.

The selected course shows mapped course notes, related files, tasks due through
the next seven days, and currently due reviews. The basis label explains the
association used. File create, delete, rename, and modify events refresh the
view. Opening an item only opens its existing Vault file: Course Overview never
moves material, edits metadata, marks a course complete, or invents a
completion percentage. Use **Academic Dashboard: Diagnose academic materials**
when a course or resource is missing.

## Academic note creation

The course, paper-reading, and book-reading templates default to `Course`,
`Paper`, and `Reading`. Before creating a note, Dashboard searches the selected
root recursively using Unicode-normalized, case-insensitive names:

- an exact matching folder receives the note;
- related files whose basename equals the title or begins with the complete
  title keep the note in their one common folder;
- no match creates `<root>/<title>/<title>.md`; and
- equally suitable matches in different folders stop as an ambiguity.

Dashboard never moves or modifies related files, and exclusive creation still
refuses an existing Markdown target. Local Home/command creation retains its
content preview. For the equivalent Claudian course, paper, and book workflows,
Dashboard performs this scan through Obsidian's Vault API before handoff and
passes one resolved path to Claudian. Claudian does not need Shell access or a
user-supplied file list. It creates that one note without a second approval once
the user has pressed Send.

Before changing academic mappings, run **Academic Dashboard: Diagnose academic
materials** from the command palette. The manual diagnostic is read-only: it
lists Markdown paths, reads parsed frontmatter, and previews the active course
and paper roots plus field/value mappings. Edit the draft rules in the modal to
compare recognition counts before saving the same choices in Settings; the
draft itself is never persisted. The result shows scan progress, bounded counts,
and at most eight issue paths. It distinguishes matched course and paper notes,
course markers whose type does not match, invalid paper status, unclassified
notes in each configured root, metadata read errors, and excluded hidden or
generated paths. It never reads note bodies or changes files. Close the modal or
choose **Cancel** to stop a running scan.

For reading-queue identity, the metadata settings also expose **Book type**,
**Edition**, and **Reading ID** mappings. Existing `book-note` notes remain
compatible. A unique Reading ID is the strongest way to reconnect plugin-side
reading records after a note rename; edition prevents different versions from
being treated as the same book merely because their titles match.

The Research **Reading Queue** separates papers and books and can filter the
visible list by queue status. Each row opens the source note and stores its
manual order, next step, and page/chapter or paper-stage position in Dashboard
plugin settings. Paper frontmatter status and compatible book status provide
an initial display only; saving queue progress does not write either source
field. No percentage is shown because the queue does not assume a total page
count.

## Review sessions

The Study **Review Session** reads the same due items as Review Queue. Choose a
course, notes or flashcards, and a limit of 10 or 20 before starting. Within the
session, opening the source, marking an item viewed, and skipping are separate
actions. **Viewed this session** records only the current in-memory interaction;
it does not claim recall, mastery, or completion. Ending the session clears that
temporary state and does not affect other Dashboard pages.

An exact Native Markdown review marker also offers the existing review-first
next-date choices and conditional Undo through Review Queue. Optional-plugin
items without a verified write target remain open/view/skip only. If a note was
renamed or its marker changed, the safe write path rejects the stale target
rather than updating a similarly named item.

## Research paper actions

Research filters include keywords, status, year, and exact tags. Enter a short
name and choose **Save pinned view** to persist the current structured query in
Dashboard settings; selecting that view restores the same values after a
refresh. Up to 12 views are accepted, and invalid stored queries fall back
through normal settings validation rather than being executed.

Results are shown 10 at a time. The count states the visible range and uses a
`+` suffix when the bounded 100-item read may not represent the entire Vault.
Related-material buttons are generated only from the mapped **Related material
field** or an exact shared tag. Their tooltip states which basis was used.
Title similarity and directory proximity are not treated as confirmed
relationships.

In **Settings → Academic Dashboard → Academic metadata**, map the reading status
field used by the paper list. In **Research paper actions**, map the status write
field to that same property and choose a different favorite field. Status accepts
only `unread`, `reading`, or `reviewed`; favorite accepts only unquoted YAML
booleans `true` or `false`.

Research clicks update one existing paper and one top-level scalar immediately;
there is no second confirmation dialog. A successful action offers conditional
Undo for the current plugin session. Missing favorite may be inserted only into
an existing safe frontmatter block. Dashboard never creates frontmatter or
rewrites unrelated YAML.

## Read-only setup diagnostic

From the repository root, run:

```sh
node scripts/check-setup.mjs --vault /path/to/your/vault
```

The script reads only public plugin manifests and the enabled Community Plugin
ID list, and checks executable file availability without running a command. It
does not read plugin `data.json`, note content, shell configuration, Agent
configuration, or credential files. It never asks for an API key and makes no
changes. A missing optional component is reported as `INFO` or `WARN`, not an
installation action.

## Claudian and Agent setup

Claudian is required only for the Agent page handoff. Install and enable the
official Claudian plugin, then complete configuration in Claudian and the
selected Agent's trusted UI:

- Codex owns OpenAI/ChatGPT sign-in and its model configuration.
- OpenCode owns its provider credentials, including DeepSeek, and its model
  configuration.
- Claudian owns target enablement, CLI locations, model discovery, conversation
  transport, and permission review.
- Dashboard owns only the selected Codex/OpenCode preference and a bounded
  workflow prefill.

On macOS, Obsidian may not inherit an interactive shell `PATH`. Configure a
per-device absolute CLI path in Claudian when discovery fails. Do not paste an
API key into Dashboard settings, this repository, the setup diagnostic, an issue
report, or a screenshot.

Claudian 2.1.3 requires the user to verify the requested target and press Send.
For a course, paper, or book creation workflow, Send is the only confirmation;
the prompt forbids a second plan/diff approval request.

### Daily Note academic routing

On the Agent page, select **Organize today’s note into academic notes**. The
Dashboard resolves today's note from the configured Daily Note folder and
filename format, and supplies the current academic metadata mappings to
Claudian. The note must already exist. Optional focus text can name headings to
include or material to leave in place.

Claudian prepares a table that maps each coherent source block to one uniquely
matched existing course, paper, or book note. Review that table and every proposed
append before approval. Ambiguous blocks are left unmatched, no new target note
is created, the source Daily Note remains unchanged, and a run may touch at most
ten target notes.
Dashboard cannot reliably switch the target, auto-submit, or observe completion,
so `ready for review` is the strongest status it reports.

See [Claudian setup](claudian-setup.md), [privacy and security](privacy-security.md),
and [troubleshooting](troubleshooting.md) for the accepted boundary and recovery
steps.
