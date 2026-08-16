# Privacy and Security

## Data handling

Academic Dashboard is local-first. It uses Obsidian APIs to read Vault metadata
and the narrow note content required for native task/review parsing. Recent-note,
paper, calendar, and local activity summaries do not require a network service.
Dashboard has no Git client or subprocess executor. Its only runtime network
client is the Phase 9 GitHub contributions port described below.

Settings live in the plugin's Obsidian-managed `data.json`. They include layouts,
Widget preferences, metadata mappings, templates, the selected Agent target,
retention, and a minimal Agent write-handoff log. That log may contain only:

- timestamp and approved workflow ID;
- selected Codex/OpenCode target;
- bounded Vault-relative affected paths;
- Dashboard-to-Claudian handoff outcome; and
- a bounded non-sensitive error code.

Prompt text, note bodies, absolute paths, provider/model/auth details, API keys,
tokens, and free-form errors are not accepted by the log schema. The default
retention is 30 days, configurable from 1 to 3650 days. Cleanup runs at startup
and every six hours while the plugin is loaded.

Settings schema 6 retains the schema-5 **name/reference** for a GitHub PAT
held by Obsidian SecretStorage, the fixed six-hour cache duration, the explicit
private-count preference, non-sensitive credential revision, last successful
refresh timestamp, and up to 366 normalized date/count entries. It never
contains the PAT value. The optional private datum is one anonymous total;
repository scope, repository names, usernames, emails, response bodies, and
free-form errors are not stored.

Phase 9 reads the PAT transiently only to send an Authorization header through
Obsidian `requestUrl` to `https://api.github.com/graphql`. The constant query is
limited to the authenticated `viewer` contribution calendar. Anonymous private
contribution count is conditional on explicit opt-in and `read:user`; Dashboard
never requests `repo` or repository nodes. There is no OAuth, Device Flow, JSON
credential import, or custom API URL.

Dashboard-local write logs are separate from Agent handoff logs. They contain
only timestamp, approved operation type, Vault-relative Markdown path, finite
outcome, and an optional finite error code. They cannot retain note content,
task text, old/new scalar values, prompts, PATs, secrets, absolute paths, or
free-form errors and default to 30-day retention.

## Write and execution boundary

Dashboard's three local academic note-creation commands create at most one new note after a
user supplies a title. They validate the Vault-relative destination, refuse
hidden/traversing paths, search only the configured root for related names, and
never move or overwrite existing material. A clear match selects one existing
directory; no match creates a title-named folder; competing best matches fail
closed.

Agent work follows only:

```text
Academic Dashboard -> Claudian -> Codex | OpenCode
```

Existing-note write prompts request a plan/diff and explicit approval. The
course, paper, and book new-note prompts instead treat the user's Send as
authorization for exactly one creation after path checks, with no second
approval. All write-capable prompts forbid implicit bulk edits, deletes,
existing-file restructuring, `.obsidian` changes, shell or Git actions, and
network use. Dashboard does not send the request automatically or claim the
Agent completed a filesystem write.

Phase 7's local write infrastructure permits only one exact Markdown edit or
one exclusive note creation at a time. It fingerprints and retains the exact
pre-state in memory for commit, rereads immediately before writing, and fails
closed on conflict. Edit Undo is session-only and succeeds only while the whole
note still equals Dashboard's verified post-state. No local write capability
can delete, overwrite an existing creation destination, move, rename, batch
edit, or enter a hidden/configuration directory.

Phase 8 Home controls do not expand that capability. Native Markdown task
completion displays one exact line change and requires confirmation; its Undo
token and full before/after note states stay in memory only until plugin unload.
Missing Daily Notes and course/paper/book notes display one Vault-relative path plus
a bounded content preview before exclusive creation. Preview text, task text,
template content, and Undo state are never added to the local write log.

Tasks-plugin query results are not mutated through Community Plugin internals.
The toggle is enabled only for the verifiable Native Markdown fallback; other
results remain open-only with an explanation.

Study review updates follow the same restriction. Only one exact Native
Markdown review marker is previewed and confirmed. Missing, multiple, fenced,
moved, conflicting, or optional-plugin-only targets remain read-only. Review
Undo is session-only and cannot overwrite later note edits.

Research status/favorite clicks authorize exactly one mapped scalar update in
one existing paper note. Dashboard rereads the complete note and rejects a
stale scalar, changed paper discriminator, moved/missing path, duplicate field,
malformed frontmatter, nested/multiline value, YAML tag/alias, or complex scalar.
It may insert a missing scalar only before the closing delimiter of an existing,
otherwise safe top-level frontmatter block; it never creates frontmatter or
normalizes unrelated YAML. Paper actions use no Bases/Community Plugin write
method, network request, Agent route, or PaperPulse data.

## Limitations and threat model

- Obsidian Community Plugins run with desktop application privileges. Install
  Dashboard, Claudian, and optional plugins only from sources you trust.
- Dashboard validates data received across optional-plugin adapters, but it
  cannot sandbox another installed plugin or the selected Agent runtime.
- A Vault sync or backup service may sync Dashboard `data.json`; its privacy and
  retention behavior is outside Dashboard's control.
- Local modification times are not a complete edit history. GitHub contribution
  data is a bounded remote summary and may be stale. Dashboard performs no
  automatic Git command and exposes last updated, stale, refresh, and finite
  error states.
- Claudian 2.1.3 has no supported cross-plugin completion event. A handoff log is
  attribution for the request attempt, not proof that a file changed.

Before sharing diagnostics, remove usernames, full local paths, note names,
screenshots containing private content, and any Agent/provider configuration.
Never attach plugin `data.json` without reviewing and redacting it.

To report a suspected vulnerability, follow [SECURITY.md](../SECURITY.md) rather
than opening a public issue with sensitive details.
