# Changelog

## 0.4.0-rc.11

- Prepared the package for public npm distribution under the `next` dist-tag.
- Added English and Japanese architecture/allocation diagrams.
- Expanded English and Japanese documentation with role definitions, install instructions, and explicit estimate/execution disclaimers.
- Kept `execute_task` hidden and disabled by default.

## 0.4.0-rc.9

- Prevent artifact SHA drift by keeping the external direct-handoff receipt out of the npm package.
- Keep the MCP `initialize` version sourced from `package.json` with package/server equality regression coverage.

## 0.4.0-rc.8

- Add Sol final QC status to the privacy-bounded execution audit log while omitting the final answer body from log storage.
- Keep RC7's read-only release documentation allowance and actual publish/send/deploy fail-closed behavior.
- Report the package version from MCP `initialize` and assert package/server version equality in the MCP smoke test.

## 0.4.0-rc.7

- Keep actual publish/send/deploy/production operations blocked, while allowing read-only release documentation tasks such as pre-release checklists, rollback instructions, and handoff drafts to run under Sol-managed execution.
- Add regression coverage so direct GitHub/npm publish commands still fail closed, while release-preparation drafts can complete.

## 0.4.0-rc.6

- Allow Sol-approved `bounded_low_risk` Terra/Luna subtasks to remain downshifted when a deep keyword appears only as product/domain text; critical, high-risk, approval, and unbounded deep work still fail closed to Sol.
- Pass completed prior subtask results into later subtask calls so Sol integration/QC tasks can inspect the actual Terra/Luna outputs.
- Remove model-reported pre-synthesis numeric percentages from final allocation reasons; final measured percentages remain server-calculated in `measured_allocation`.
- Require the dedicated `model-router` agent to deny the auto-exposed read-only `session_status` tool.

## 0.4.0-rc.5

- Use the model IDs registered in the OpenClaw model catalog (`openai/gpt-5.6-*`) for native agent calls.
- Keep Codex harness, auth-profile, fallback-zero, and tool-isolation checks in the returned runtime metadata.
- Correct the RC4 transport-namespace assumption after live diagnostics showed the actual blocker was an invalidated Codex OAuth token (`401 token_invalidated`).

## 0.4.0-rc.4

- Reuse the configured per-model retry limit for Sol planning as well as subtask execution and final QC.
- Apply the configured per-model timeout to Sol planning instead of silently falling back to the 120-second constant.
- Superseded in RC5: the `codex/gpt-5.6-*` transport mapping did not match the active OpenClaw model catalog.
- Record the successful Sol planning attempt count in results and audit logs.
- Keep retries capped at two and preserve fail-closed behavior after the final failure.

## 0.4.0-rc.3

- Replaced stale API-key, direct-provider storage, and no-tools claims in `SECURITY.md` with the current OpenClaw Gateway, Codex auth-profile, isolated-agent, and runtime-managed retention boundaries.

## 0.4.0-rc.2

- Fixed the CLI `plan` payload so estimate-only `requested_mode` and `requested_model` fields are not sent to `planTask`.
- Added a CLI regression test that proves `plan` passes input validation and reaches the OpenClaw agent configuration gate.

## 0.4.0-rc.1

- Replaced the withdrawn authentication design with an OpenClaw Gateway + Codex auth-profile adapter.
- Added strict model, harness, authentication mode, fallback, and tool-isolation verification.
- Made unsupported runtimes fail closed with no alternate transport.
- Relabeled usage-derived USD figures as configured reference estimates, never measured billing.
- Kept model execution hidden and disabled by default.

## Withdrawn releases

- `0.4.0-rc.8`, `0.4.0-rc.6`, `0.4.0-rc.5`, `0.4.0-rc.4`, `0.4.0-rc.2`, `0.4.0-rc.1`, `0.3.0-rc.2`, `0.2.0-rc.1`, and `0.1.0` are superseded and prohibited as rollback targets.
