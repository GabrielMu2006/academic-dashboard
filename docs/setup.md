# Setup and Installation

Academic Dashboard is a desktop Obsidian plugin. Its local Widgets work in a
plain Vault. Claudian, Tasks, Spaced Repetition, and Bases are optional; missing
or incompatible integrations show an explicit fallback instead of blocking the
Dashboard.

Academic Dashboard 0.2.0 requires Obsidian 1.11.4 or newer because GitHub
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
Vault-relative path such as `Reading/每日引言.md`, save it, and choose
**Open file** to edit it in Obsidian. Each non-empty, non-heading line is one
quote, up to 366 entries (enough for a leap year); Markdown bullets,
numbered-list prefixes, and blockquote markers are removed. YAML frontmatter
and HTML comments are ignored. The Widget reloads the file periodically,
selects one entry deterministically per local calendar day, and never uses a
network quote service.

The settings page retains the original local quote list as a compatibility
fallback. It is used only when the quote-file path is empty. A missing or empty
configured file is reported explicitly instead of silently switching sources.

## Research paper actions

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

### Daily Note academic routing

On the Agent page, select **Organize today’s note into academic notes**. The
Dashboard resolves today's note from the configured Daily Note folder and
filename format, and supplies the current academic metadata mappings to
Claudian. The note must already exist. Optional focus text can name headings to
include or material to leave in place.

Claudian prepares a table that maps each coherent source block to one uniquely
matched existing course or paper note. Review that table and every proposed
append before approval. Ambiguous blocks are left unmatched, no new target note
is created, the source Daily Note remains unchanged, and a run may touch at most
ten target notes.
Dashboard cannot reliably switch the target, auto-submit, or observe completion,
so `ready for review` is the strongest status it reports.

See [Claudian setup](claudian-setup.md), [privacy and security](privacy-security.md),
and [troubleshooting](troubleshooting.md) for the accepted boundary and recovery
steps.
