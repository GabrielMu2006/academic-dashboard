# Troubleshooting

## Dashboard does not open

Confirm that `main.js`, `manifest.json`, and `styles.css` are together in
`<vault>/.obsidian/plugins/academic-dashboard/`, Academic Dashboard is enabled,
and Obsidian Desktop satisfies the manifest's minimum version. Recopy all three
assets from the same release; mixed versions are unsupported.

Run the read-only diagnostic from the source repository if available:

```sh
node scripts/check-setup.mjs --vault /path/to/your/vault
```

If startup still fails, disable and re-enable only Academic Dashboard or restart
Obsidian. Do not delete `data.json` as a first response; it contains layouts and
settings.

## A Widget is empty or unavailable

Empty means the query succeeded but matching local data was not found.
Unavailable/fallback messages identify the missing capability and recovery.
Tasks and Spaced Repetition use Native Markdown fallbacks; Bases is omitted when
its supported custom-view API is absent. These plugins are never mandatory.

Metadata-driven paper/course results follow **Academic Dashboard settings →
Metadata mapping**. Adjusting a mapping changes future reads only and never
migrates note frontmatter.

## Research paper actions are read-only or fail

The status write field must match the metadata reading-status field. Status must
be one of `unread`, `reading`, or `reviewed`; favorite must be an unquoted YAML
boolean. Dashboard intentionally refuses absent or malformed frontmatter,
duplicate fields, nested/multiline values, YAML tags/aliases, complex values,
stale list data, later edits, moved notes, and notes that no longer match the
paper mapping. Open the note and repair the ambiguity manually; Dashboard does
not normalize frontmatter or fall back to a Bases/Community Plugin write API.

## GitHub contributions are unavailable or stale

- Confirm Obsidian is 1.11.4 or newer and save the PAT again in Academic
  Dashboard settings. The field never displays the stored value.
- A 401/unauthorized state usually means the token is missing, expired, or
  invalid. A forbidden or rate-limited state comes from GitHub; last-good cache
  remains visible when available.
- Enable anonymous private contribution count only with `read:user`. Never add
  `repo`; Dashboard does not query private repository names or contents.
- Use the Widget's **Refresh** button after network recovery. Cache older than
  six hours is labelled stale and is never silently presented as fresh.
- There is no custom endpoint, OAuth, Device Flow, or JSON token import to
  troubleshoot. The only endpoint is `https://api.github.com/graphql`.

## Study review date is read-only

Dashboard enables a date choice only when the Native Markdown fallback finds
one exact supported review marker. Aggregated flashcards, multiple markers,
fenced examples, unsupported optional-plugin results, moved files, and conflicts
remain read-only. Open the note to resolve ambiguity; Dashboard does not call
undocumented Spaced Repetition APIs.

## Layout movement or persistence fails

Choose **Edit layout**. Drag a Widget to move it or its bottom-right handle to
resize it. With keyboard focus on a Widget, use arrow keys to move,
Shift+Right/Shift+Down to grow, and Shift+Left/Shift+Up to shrink. Press Escape
or choose **Done** when finished. Changes save automatically.

Only the Widget's declared `small`, `medium`, and `large` sizes are available;
free-form pixel sizing is intentionally unsupported. Responsive one/two-column
reflow is presentation-only, so move/resize editing is available on the
canonical four-column layout and cannot overwrite it from a narrow view.

Use **Reset layout** only for the current page, or the settings reset controls
for a deliberate broader reset. A malformed stored layout falls back to project
defaults without rewriting notes.

## Claudian is missing or handoff is open-only

Install and enable Claudian, configure the selected Agent and CLI location in
Claudian, then reopen the Dashboard. A GUI-launched Obsidian may not inherit the
terminal `PATH`, especially on macOS, so use Claudian's per-device absolute CLI
path field.

Open-only means Dashboard could reveal Claudian but could not use its compatible
public composer prefill. Verify the Claudian version and continue manually;
Dashboard must not reach into Claudian internals as a workaround.

## Handoff says ready for review but nothing ran

This is expected with Claudian 2.1.3. `Ready for review` or `Ready to send` means
the bounded request was placed in the composer. Verify Codex/OpenCode in
Claudian, review the prompt, then press Send yourself. Dashboard cannot report
running/completed/failed Agent execution without a supported Claudian signal.

For course, paper, or book creation, press Send once after checking the target.
That workflow is instructed to run its path preflight and create one note
without asking for another plan/diff confirmation. Other write workflows still
pause for review before modifying existing notes.

## Academic note creation reports an ambiguous destination

Dashboard found equally suitable related names in more than one directory
under the configured `Course`, `Paper`, or `Reading` root. It stops instead of
guessing. Use a more specific title, organize the related material manually, or
temporarily choose a narrower destination in settings. Dashboard does not move
existing PDFs or notes and never overwrites the target Markdown file.

## Authentication or model problems

Resolve OpenAI/ChatGPT authentication in Codex and DeepSeek/other supported
provider configuration in OpenCode. Resolve target, model discovery, CLI paths,
and permissions in Claudian. Dashboard deliberately has no API-key, provider,
or model control and cannot repair those credentials.

## Safe recovery information

When filing a non-security issue, include Dashboard, Obsidian, and optional
plugin versions; operating system; the Widget/error state; and minimal
reproduction steps. Exclude API keys, tokens, note bodies, full local paths,
Agent transcripts, and unreviewed `data.json` contents.
