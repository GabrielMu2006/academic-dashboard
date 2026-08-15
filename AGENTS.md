# Contributor and Coding-Agent Instructions

## Read first

Before changing code, read `PROJECT.md`, `ROADMAP.md`, and every relevant file under `docs/`. Inspect the current repository and Vault integration environment before proposing architecture or dependencies.

## Core constraints

- Keep this project an independent Git repository; never absorb a user Vault into Git.
- Put source code below `plugin/`; keep product decisions in the root/docs documents.
- Claudian is the execution core. Do not build a parallel agent runtime, direct provider executor, or replacement terminal agent.
- Support switching between Codex and OpenCode. In V1, provider/model/auth settings stay owned by those agents.
- Target OpenAI and DeepSeek in V1 through the target agent’s supported configuration—not through dashboard-managed API keys unless a later approved design changes this.
- Design macOS-first without hard-coding macOS-only assumptions.

## Safety rules

- Read access across the Vault is expected; write access must be narrow and intentional.
- Never delete notes, mass-edit notes, restructure folders, or modify `.obsidian` without explicit user approval.
- Do not expose API keys, tokens, local paths with secrets, or full note content in logs.
- Log each agent-initiated write with minimal metadata and honor configurable retention (30 days by default).
- Optional dependency missing? Use a fallback state, not an exception or mandatory install prompt.

## Engineering rules

- Define adapter contracts before connecting to Tasks, Spaced Repetition, Bases, metadata schemas, activity sources, or Claudian.
- Prefer capability detection and explicit error states over version guessing.
- Persist layout and settings using Obsidian-supported plugin data mechanisms.
- Make widget state isolated, recoverable, and testable. One failed widget must not compromise a dashboard page.
- Use semantic tokens for color, surfaces, typography, and spacing. Never spread raw red/purple colors throughout components.
- Preserve accessibility: keyboard navigation, clear focus states, sufficient contrast, and non-color status cues.
- Keep external dependency evaluation documented, including license compatibility, maintenance, Obsidian version fit, and extraction/forking cost.

## Delivery discipline

1. Begin each milestone with a small audit and explicit acceptance criteria.
2. Make focused, reviewable changes; avoid broad scaffolding before the foundation decision.
3. Run relevant checks/tests/builds and report results honestly.
4. Update documentation when requirements, interfaces, risks, or setup behavior change.
5. Do not treat a visual clone as success; interaction and data architecture matter more.
