# Claudian Integration and Setup

## Role in this project

Claudian is the dashboard’s single agent execution core. The dashboard may select Codex or OpenCode as the target but does not execute providers itself, embed an alternative runtime, or bypass Claudian.

## V1 contract

- The user selects **Codex** or **OpenCode** in the dashboard.
- The dashboard uses a Claudian adapter to check availability, hand off an approved workflow, and surface outcome/status.
- The selected agent controls its own provider, model, authentication, permissions, and execution details.
- The supported V1 provider scope is **OpenAI** and **DeepSeek**, as configured by the selected agent.
- The dashboard must not claim that a provider/model is active unless Claudian/the target can report it reliably.

## Assisted setup, manual authentication

Provide a helper script under `scripts/` after the Phase 0 audit. Its purpose is to:

1. Detect the expected applications/commands/configuration prerequisites.
2. Validate that the Obsidian plugin can reach the intended integration boundary.
3. Explain the next manual steps and report non-sensitive diagnostics.

Authentication is manual. Users sign in to the relevant agent or enter API keys using the established trusted flow for that tool. The helper must never solicit secrets through ordinary terminal prompts, print them, or commit them into this repository.

## Verified macOS setup — 2026-08-11

The Phase 0 audit verified the following environment on the acceptance platform:

| Component | Verified state |
| --- | --- |
| Obsidian Desktop | 1.13.4 runtime |
| Claudian | 2.1.3 official release; manifest/plugin id `realclaudian` |
| Codex CLI | `codex-cli 0.147.0-alpha.6.5`; ChatGPT/OpenAI authentication |
| Codex model discovery | Six models discovered; `gpt-5.6-sol` selected for the smoke test |
| OpenCode CLI | 1.18.14; DeepSeek credential managed by OpenCode |
| OpenCode model discovery | Eleven models across two providers; a DeepSeek model selected for the smoke test |

Claudian successfully launched both targets, received streamed responses, and gave both agents read-only access to files below the current Vault. The smoke tests read `dashboard/README.md` through OpenCode and `dashboard/PROJECT.md` through Codex without modifying files. Keep YOLO/automatic broad approval disabled by default.

### CLI discovery on macOS

GUI applications do not reliably inherit the interactive shell `PATH`. In the verified environment, the launch-services PATH was empty even though both commands resolved in a terminal. Claudian's per-device CLI path fields are therefore the preferred configuration mechanism.

Verified path shapes:

```text
# Codex bundled with the ChatGPT desktop application
/Applications/ChatGPT.app/Contents/Resources/codex

# OpenCode installed in the user's home directory
~/.opencode/bin/opencode
```

Expand `~` before storing a CLI path if the settings field requires an absolute path. These values are device configuration, not application constants: Dashboard code and shared defaults must discover paths or consume Claudian-reported availability instead of embedding them.

### Provider responsibility in the verified setup

- Codex owns the OpenAI/ChatGPT login and its selected OpenAI model.
- OpenCode owns the DeepSeek credential and its selected DeepSeek model.
- Claudian owns target enablement, per-device CLI paths, model discovery, session transport, and permission UI.
- Dashboard will own only the user's selected target and workflow handoff in V1. It must not copy credentials or duplicate provider/model configuration.

Installing from a release does not require the local Node.js version used to build Claudian. Building Claudian 2.1.3 from source requires Node.js 24 according to its package metadata; the Dashboard plugin has a separate toolchain and must not inherit that requirement without need.

## Workflow handoff

The first workflows are:

- Organize/polish current note
- Summarize current note
- Check and repair Markdown
- Search the full Vault and answer a question
- Organize today's Daily Note into existing course or paper notes
- Create course note
- Create paper-reading note

Each request contains only the needed context: selected workflow, a validated
Vault-relative current-note path when applicable, a bounded user question or
focus, a template reference/destination when relevant, and explicit safety
scope. Dashboard never reads a note body merely to prepare the request.

The Daily Note routing workflow resolves today's note from **Settings →
Academic Dashboard → Daily Note creation**. It uses the configured academic
metadata mappings to distinguish existing course and paper notes. Claudian must
first show a routing table and proposed append-only changes; unmatched material
stays in the Daily Note, the source is not edited, and one run is limited to ten
existing targets. The user still verifies the selected Agent, sends the request,
and approves the proposed changes in Claudian.

### Claudian 2.1.3 compatibility contract

The official 2.1.3 source and installed plugin expose a stable Obsidian command
(`realclaudian:open-view`) plus public view methods to focus and append to the
active composer. They do not expose a documented cross-plugin API for selecting
Codex/OpenCode, submitting a request, or receiving execution/completion events.

The Phase 4 adapter therefore:

1. detects the enabled `realclaudian` plugin and version;
2. opens Claudian and, when supported, pre-fills a bounded request;
3. asks the user to verify the requested Agent target in Claudian;
4. leaves submission entirely to the user; and
5. fails softly to open-only or unavailable status when capabilities are absent.

This is an explicitly labelled compatibility layer, not a second runtime. It
does not import Claudian transport/provider internals or call either Agent CLI.
See the [Claudian repository](https://github.com/YishenTu/claudian) and the
[2.1.3 source tag](https://github.com/YishenTu/claudian/tree/2.1.3).

## Write policy

Read access may span the Vault. Agent writes must remain conservative. Never
allow implicit large-scale rewrites, deletes, folder restructuring, or
`.obsidian` modifications. When Claudian/the target can present a plan or diff,
expose that review opportunity. Dashboard logs only its own attempted
write-capable handoffs with minimal metadata; Claudian 2.1.3 cannot provide a
supported completion signal, so the log must not claim that an Agent write
completed. Expired entries are deleted according to the configurable retention
policy (30 days default).

## Future expansion

After V1 is stable, evaluate whether the Claudian contract can safely report and control Agent → Provider → Model. Do not add dashboard provider/model settings merely as decorative UI; controls must be backed by a documented, tested integration.
