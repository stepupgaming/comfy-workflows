# CI / drift gates

Minimum gates for a product repo that authors graphs:

1. Typecheck `ir.build.ts` against generated nodes
2. Rebuild IR / manifests
3. `git diff --exit-code` on generated artifacts
4. `cwf pack` on each workflow package
5. Optional: `cwf validate --defs environments/*/defs.json` (or live `--url` on a nightly)

This repo's own CI does the equivalent for core codegen and the two first-party packages.

## Docs in this repo

```sh
pnpm docs:gen
pnpm docs:check
pnpm --filter comfy-workflows-docs docs:build
```

`docs:check` verifies CLI commands and error codes still exist in source, and that pages do not mention stale package names.

## What not to automate

`cwf setup` installs executable Python. Do not run it as a surprise side effect of `test` or `run`. Nightly environment rebuilds can call setup with `--yes` on a disposable VM after printing the plan.
