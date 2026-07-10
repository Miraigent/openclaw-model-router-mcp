# Security policy

## Supported versions

Only the newest pre-release or release is supported. `0.4.0-rc.2` and all earlier builds are withdrawn and prohibited rollback targets.

## Report a vulnerability

Before the public repository exists, report privately to the Miraigent project owner. After repository creation, use its private security advisory flow. Do not post secrets, credentials, personal data, exploit payloads, or unpublished vulnerabilities in public issues.

## Security boundaries

- The server accepts tasks up to 12,000 characters and rejects unknown fields and invalid numeric ranges.
- Secret/credential/personal-sensitive inputs and detected secret literals are blocked before the model call.
- Model work runs only through the OpenClaw Gateway with an existing Codex auth profile. The package does not accept provider API keys or make direct provider network requests.
- The dedicated router agent may expose only `sessions_yield`. Missing tool-policy evidence or any additional tool fails closed.
- Requested model, Codex harness, auth-profile mode, fallback 0, and OpenClaw token usage must all be present and valid in the native response.
- Structured model output is validated again server-side. Unknown models fail closed.
- Server safety gates may only retain Sol or add approval; they cannot relax the model plan.
- `execute_task` is disabled by default and cannot be enabled by client input. Server-owned config or `MODEL_ROUTER_EXECUTION_ENABLED` is required.
- Execution blocks secret, credential, personal-sensitive, production, and external-action requests.
- Execution allocation is Sol's per-subtask judgment. Reference diagram ratios are not config, quota, routing rules, or test oracles.
- Measured model and token usage is logged separately with Sol allocation reasons. USD values are configured reference estimates, not measured billing.
- Critical log entries omit task text and store only a fixed marker plus SHA-256.

Storage and retention behavior is managed by the OpenClaw/Codex runtime. This package does not issue provider storage parameters. Operators must review the current OpenClaw/Codex data policy and decide whether task data is allowed to enter that runtime.
