# Agent Targets and Providers

## V1 responsibility map

| Concern | Dashboard | Claudian | Codex / OpenCode |
| --- | --- | --- | --- |
| Select target agent | Yes | Receives selection | Is selected |
| Execute workflow | No | Yes | Via Claudian-supported handoff |
| Provider configuration | No | Coordinates as supported | Yes |
| Model configuration | No | Coordinates as supported | Yes |
| Authentication / API keys | No | No secret collection | Yes, through its trusted setup |
| Show reliable status | UI only | Source of integration status | Source where exposed |
| Write audit log | Records minimal dashboard-side event | Execution details as supported | Execution details as supported |

## Scope

V1 validates workflows with **OpenAI** and **DeepSeek** as the intended provider set. This is a compatibility goal, not permission for the dashboard to store provider credentials. Configuration belongs to the chosen target agent.

## Target switching

Persist the user’s selected target in plugin settings, but validate availability at runtime. If the selected target is unavailable, preserve the preference, show why it cannot be used, and offer the other available target without silently changing the setting.

Status should be conservative:

- **Available**: integration boundary is verified.
- **Unavailable**: prerequisite, installation, or connection is missing.
- **Unknown**: status cannot be safely determined.
- **Busy / completed / failed**: only while backed by real execution signals.

## Provider and model UI

V1 may display provider/model information only if the selected agent can provide it through a supported integration. Otherwise show that configuration is managed by the selected agent. Full direct switching of Agent → Provider → Model is post-V1 work and requires an explicit supported contract and security review.

## Security principles

- Do not copy API keys into dashboard settings, logs, screenshots, or Git.
- Avoid custom credential forms when the target agent already has an authenticated configuration mechanism.
- Use the setup helper only for checks and guidance; manual login/API key entry remains user-controlled.
- Include errors that help diagnose missing setup without revealing confidential configuration.
