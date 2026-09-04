# Agent-friendly surface

The SDK is useful for coding agents because the edges are boring and stable.

- CLI prints JSON on stdout for machine consumption; errors are JSON on stderr
- `--json` on `init`, `suggest`, `pack`, `inspect`, `resolve-nodes`, `setup`
- `cwf inspect` / `cwf explain` / `cwf catalog` do not guess
- Structured `ComfyError.code`
- Workflow packages are pure data; inspect does not execute package JS
- Node-pack resolution does not call an LLM
- Deterministic compile: same graph → same bytes

This is not "AI magic." Predictable JSON and no hidden installs are what make automation safe.

Do not have an agent run `cwf setup --yes` against a developer laptop as a surprise.
