# GitHub publication plan

> Historical plan: the initial 0.2.0 publication described below is complete.
> Current development and releases use this public repository on `main` as the
> canonical source. The sibling `dashboard/` directory is a local archive and
> must not be used to build or publish releases.

This plan publishes Academic Dashboard as an independent public repository,
creates an installable GitHub release, and leaves Community Plugins submission
as a later explicit step.

## Target

| Item | Decision |
| --- | --- |
| GitHub owner | `GabrielMu2006` |
| Repository | `academic-dashboard` |
| Visibility | Public |
| Default branch | `main` |
| Initial public version | `0.2.0` |
| Release tag | `0.2.0` (exactly matches the manifest; no `v` prefix) |
| Plugin ID | `academic-dashboard` (permanent after release) |
| License | MIT |
| Community listing | Separate step after public beta and release validation |

The private local development archive is an independent Git repository. The
GitHub repository should be created from a clean public history, with no
generated README, license, or `.gitignore` starter commit.

## Release blockers

The current source is not ready to push unchanged. Resolve all of these first:

1. **Repository-root manifest:** Obsidian's submission process reads
   `manifest.json` from the default branch root. The current canonical manifest
   is under `plugin/`; add a synchronized root `manifest.json` or move to the
   conventional root layout without creating two drifting sources of truth.
2. **Exact release tag:** the current workflow accepts `v*.*.*` and checks
   `v` plus the manifest version. Obsidian requires the tag to equal the version
   exactly, so change it to `*.*.*` and validate `0.2.0`, not `v0.2.0`.
3. **Version map:** add root `versions.json`, initially mapping `0.2.0` to
   `1.11.4`.
4. **Public author identity:** replace the generic manifest author
   `Academic Dashboard` with the intended public author name and optionally add
   `authorUrl` before the plugin ID is submitted.
5. **History privacy:** current development documents and earlier commits
   contain device-specific absolute paths and local acceptance details. Do not
   push the existing history as-is. Build a sanitized public tree and start a
   clean public history, or deliberately rewrite and re-audit every commit.
6. **Public documentation set:** remove, archive outside Git, or sanitize stale
   internal phase reports that expose local paths or describe an obsolete
   implementation state. Keep user, contributor, architecture, security, and
   current verification documentation.
7. **Release media:** capture synthetic-data screenshots following
   `docs/demo.md`; never show a real Vault, username, token field, local path, or
   Agent conversation.

## Phase 1 — Define the public source tree

Keep these public categories:

- plugin source, tests, build configuration, and lockfile;
- root manifest and `versions.json`;
- README, license, changelog, contribution, conduct, security, and third-party
  notices;
- current setup, architecture, privacy/security, troubleshooting, integration,
  theme contract, and release documentation;
- issue templates and the corrected release workflow.

Exclude these categories:

- every installed plugin `data.json`;
- `.obsidian`, real Vault notes, local quote files, and private templates;
- `node_modules`, generated maps, coverage, local release staging, logs, and
  environment files;
- credentials, SecretStorage values, Agent sessions/transcripts, absolute user
  paths, usernames in local diagnostics, and unredacted screenshots;
- obsolete local-only acceptance reports that are not useful to public users or
  contributors.

Because sensitive path strings already exist in local history, deleting them in
a new commit is insufficient. The recommended approach for the first public
push is:

1. Preserve the current repository as the private local development archive.
2. Create a temporary clean publication worktree from the accepted current
   files only, after sanitization.
3. Initialize one new public root commit with intentional attribution and the
   MIT license.
4. Run the complete audit against that exact public commit.
5. Publish that clean history to `GabrielMu2006/academic-dashboard`.

Acceptance: the intended public tree contains no personal Vault data or device
paths, and a full-history secret/path scan is clean.

## Phase 2 — Make the repository Obsidian-compatible

1. Establish one canonical manifest source and expose the required root
   `manifest.json`.
2. Add root `versions.json`:

   ```json
   {
     "0.2.0": "1.11.4"
   }
   ```

3. Update the build or verification script to assert that the release manifest,
   root manifest, `package.json`, `versions.json`, changelog, and tag use the
   same version.
4. Change the GitHub Actions tag trigger and comparison from `v0.2.0` to
   `0.2.0`.
5. Keep release assets at their required top-level names:
   `main.js`, `manifest.json`, and `styles.css`.
6. Retain the optional ZIP, license/notices, and `SHA256SUMS`, but do not make
   users unpack a nested folder for Community installation.
7. Confirm the stable plugin ID `academic-dashboard` is available in the current
   Community Plugins directory immediately before submission.

Acceptance: a dry-run release job produces three correctly named individual
runtime assets whose manifest matches the root manifest and version tag.

## Phase 3 — Verify the public candidate

From `plugin/` run:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm ls --omit=dev --depth=0
```

Then perform these checks against the exact public candidate:

1. Inspect the generated `main.js` for credentials, absolute user paths,
   unexpected endpoints, subprocess/Git execution, dynamic code loading, and
   development-only logging.
2. Confirm the only runtime endpoint is the documented GitHub GraphQL endpoint.
3. Confirm no `data.json`, environment file, note, local template, screenshot,
   or Agent/session content is tracked or packaged.
4. Install only `main.js`, `manifest.json`, and `styles.css` into a synthetic
   test Vault while retaining an existing test `data.json` across upgrade.
5. Test Default Light/Dark, an unrelated Community theme, PaperPulse Academic,
   English/Simplified Chinese, keyboard-only use, 200% zoom, reduced motion,
   increased contrast, and the supported narrow layout.
6. Test every optional dependency in available and absent/incompatible states.
7. Exercise local note actions only on synthetic notes and verify conflicts,
   no-overwrite creation, bounded logs, and session-only conditional Undo.
8. Verify the GitHub Widget without `repo` scope and verify the Claudian handoff
   stops at review/prefill without automatic sending.
9. Run the read-only setup diagnostic and ensure its output is safe to share.

Acceptance: CI and the clean-archive audit pass, the public assets install in a
fresh Vault, and all security/privacy disclosures match observed behavior.

## Phase 4 — Create and push the GitHub repository

1. Create the empty public repository `GabrielMu2006/academic-dashboard`.
2. Push the sanitized public `main` history and set upstream tracking.
3. Verify README rendering, license detection, issue templates, Actions
   permissions, branch protection, and private vulnerability reporting.
4. Add a concise repository description and topics.
5. Let the normal branch workflow run and require it to pass before tagging.

Suggested repository description:

> A local-first academic dashboard for Obsidian with configurable widgets,
> conservative note actions, and review-first Claudian Agent handoffs.

Suggested topics:

```text
obsidian obsidian-plugin academic dashboard research study productivity
typescript
```

Acceptance: the public default branch contains only the audited clean tree and
all GitHub Actions checks pass.

## Phase 5 — Publish release 0.2.0

1. Create the tag `0.2.0` from the accepted `main` commit and push it.
2. Let GitHub Actions rebuild from the lockfile and run all verification steps.
3. Create a normal GitHub Release titled `Academic Dashboard 0.2.0`.
4. Confirm these individual attachments exist at the release root:
   `main.js`, `manifest.json`, and `styles.css`.
5. Also confirm the optional ZIP and `SHA256SUMS` are present and accurate.
6. Download all public assets into a temporary directory and compare hashes.
7. Install the downloaded three-file set into a fresh synthetic Vault and run a
   final smoke test.
8. Add screenshots and release notes only after reviewing them for private data.

Acceptance: the release tag exactly equals `0.2.0`, the three Obsidian assets
are individually downloadable, hashes match, and a public-asset installation
opens successfully.

## Phase 6 — Public beta before Community submission

Keep the GitHub release available for a short public beta:

1. Collect issues using the repository templates and synthetic reproduction
   data.
2. Confirm installation/update instructions are sufficient for a new user.
3. Resolve release-blocking startup, data-loss, security, privacy,
   accessibility, or compatibility findings in a new Semantic Version.
4. Do not replace assets on the existing `0.2.0` tag; publish a new version for
   every correction.
5. Recheck the Obsidian developer policies and automated review requirements
   immediately before submission because they can change.

## Phase 7 — Optional Community Plugins submission

After the beta is accepted:

1. Confirm the root `README.md`, `LICENSE`, and `manifest.json` are accurate on
   the default branch.
2. Confirm the release tag exactly matches the manifest version and exposes the
   three individual assets.
3. Link the GitHub account to the Obsidian Community profile.
4. Submit the repository URL through the current Obsidian Community directory.
5. Address automated and maintainer feedback with a new version and new release,
   never by mutating an already published tag.

Only the initial plugin version needs directory submission. Later compatible
versions are discovered from the repository manifest, `versions.json`, and
matching GitHub Releases.

## Ongoing release checklist

For every later release:

- update the canonical manifest, root manifest, `package.json`,
  `versions.json`, and `CHANGELOG.md` together;
- run build, type-check, lint, tests, production dependency audit, package
  inspection, and synthetic-Vault acceptance;
- scan the current tree and complete Git history for secrets and personal paths;
- tag with the exact manifest version and no prefix;
- attach `main.js`, `manifest.json`, and `styles.css` individually;
- verify downloaded asset hashes and perform one clean install/update test; and
- publish security fixes through a coordinated advisory when applicable.
