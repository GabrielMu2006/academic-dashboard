# Contributing

Thank you for improving Academic Dashboard. Please read `AGENTS.md`,
`PROJECT.md`, `ROADMAP.md`, the architecture document, and the current release
and security documentation before proposing a change.

## Development

Use Node.js 22 or later:

```sh
cd plugin
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Keep changes focused and add tests at the project-owned contract boundary.
Adapters must capability-detect optional dependencies and return an explicit
fallback/unavailable state. One Widget failure must remain isolated.

## Safety and privacy

- Claudian remains the only Agent execution core. Do not add a direct Agent CLI,
  Provider API, subprocess, credential store, or runtime network client.
- Never commit API keys, tokens, Agent transcripts, plugin `data.json`, local
  absolute paths, private note content, or screenshots containing user data.
- Do not make tests modify a real Vault. Use fake ports and bounded fixtures.
- Writes must be narrow, user-triggered, validated, attributable, and
  review-first. Never delete, mass-edit, reorganize a Vault, or change
  `.obsidian` as part of a test.

## Pull requests

Describe the user-visible outcome, affected contracts, fallback behavior,
security/privacy impact, and the checks you ran. Update setup, architecture,
troubleshooting, changelog, or release notes when behavior changes. Include an
accessible keyboard path and non-color status cue for interactive UI.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
