# Contributing

1. Keep the project dependency-free unless a dependency has a documented security and maintenance reason.
2. Never add API keys, tokens, cookies, personal data, production prompts, or real provider responses to fixtures.
3. Preserve the core invariant: Sol performs the routing judgment; deterministic rules only tighten safety or provide a clearly labeled estimate.
4. Do not add task execution, posting, deployment, deletion, payment, or external-send behavior under `plan_task`.
5. Add failure tests for every new external/input boundary.
6. Run `npm run check`, `npm test`, and `npm pack --dry-run --json` before review.
7. Public release requires separate security/QC approval and packed-artifact inspection.
