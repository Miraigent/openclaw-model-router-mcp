# OpenClaw Model Router MCP

Version `0.4.0-rc.9` is a local release candidate. External distribution and production use remain on hold pending live-path QC.

The router uses the OpenClaw Gateway's existing Codex auth profile. It never accepts provider credentials, never sends provider HTTP requests itself, and never falls back to another transport. Sol plans the task, bounded low-risk work may be assigned to Terra or Luna, and server-side safety gates can only retain Sol or require approval.

## Requirements

- OpenClaw `2026.6.10` or newer with working Codex authentication.
- A dedicated OpenClaw agent with only the harmless `sessions_yield` tool available. On OpenClaw 2026.6.10, explicitly set `tools.deny=["session_status"]` because the read-only core tool is otherwise auto-exposed.
- `MODEL_ROUTER_OPENCLAW_AGENT` set to that agent id.
- No provider credential is required by this package.

The adapter invokes `openclaw agent` through the running Gateway and verifies all of the following before accepting output:

- provider/model match the requested Sol, Terra, or Luna model;
- `agentHarnessId=codex` and `authMode=auth-profile`;
- no model fallback was used;
- the dedicated agent tool policy contains no tool other than `sessions_yield`;
- OpenClaw returned measured token usage.

If any check fails, the router stops. There is no alternate provider path.

## Local checks

```bash
npm run check
npm test
MODEL_ROUTER_OPENCLAW_AGENT=model-router node src/cli.mjs plan "Draft a safe implementation plan"
```

`estimate_task` is deterministic and does not invoke a model. `plan_task` invokes Sol through OpenClaw but never executes planned subtasks. `execute_task` remains hidden and disabled by default; a client request cannot enable it.

## Usage and accounting

OpenClaw is the source of truth for the executed model and token usage. USD fields are explicitly labeled configured reference estimates and are never presented as invoices or actual billing.

The routing fields and the model IDs passed to `openclaw agent` use the configured OpenClaw model IDs `openai/gpt-5.6-*`. The adapter still requires the Codex harness and an OpenClaw auth profile in the returned runtime metadata; it never falls back to a direct provider call or API key.

## Hold line

Do not register this package in a Gateway, publish it, or enable execution until authentication-path QC and a clean isolated-agent smoke test pass. If validation fails, remove the package and return to the uninstalled state; do not restore `0.3.0-rc.2`.
