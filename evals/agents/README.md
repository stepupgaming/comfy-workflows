# Agent acceptance evals

These fixtures define expected behavior for coding agents using Comfy Workflows.

They are **not** paid-model CI. `pnpm agent:check` only asserts the files exist and that agent-facing docs do not teach forbidden actions.

Run a real model against them only when you want a smoke test.

Each file: TASK, PASS, FAIL.

See `acceptance-scenarios.md` for the ten required scenarios.
