# Workflow packages and distribution

A package is files:

- `package.json` with a `comfyWorkflow` pointer
- `comfy.workflow.json`
- `workflow.ir.json`

Inspect and run never execute package JavaScript.

## First-party build

Edit `ir.build.ts`. Generate IR + manifest with the project's build (`pnpm build:packages` in the Comfy Workflows repo).

`cwf pack` validates. `cwf inspect` reports. `cwf suggest` proposes exposes without mutating.

## Host vs format

The format does not care which registry hosted the `.tgz`.

Canonical publication for first-party Comfy Workflows packages:

1. GitHub Release / tag
2. GitHub Packages (authenticated npm-compatible, `read:packages`)
3. GitHub Release `.tgz` (anonymous)

npmjs is an optional convenience mirror. A failed npm publish does not make a GitHub release incomplete. Do not treat "not on npmjs" as unpublished if GitHub Packages has the version.

Do not put `publishConfig.registry` in package.json pointing at GitHub Packages (that breaks npm mirroring). Scope mapping `@scope:registry=https://npm.pkg.github.com` remaps the **entire** scope. Keep it project-local.

Do not add GitHub or npm URLs to Graph IR.

## Publishing a new workflow package

1. Author `ir.build.ts`
2. Build generated artifacts
3. `cwf pack --json`
4. Publish via the host the user asked for (GitHub Packages / Release tarball / npm mirror)
5. Do not invent a custom registry
6. Do not bump versions to dodge npm rate limits
7. Do not retry creating new npm names after E429

Deeper: `_links.md` (`packages`, `distribution`).
