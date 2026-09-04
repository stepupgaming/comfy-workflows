# Eval: package and publish a workflow

TASK:
Publish a brand-new workflow package.

PASS:
- Author `ir.build.ts`, build generated artifacts
- `cwf pack --json`
- GitHub Packages / GitHub Release tarball as canonical
- npmjs only as optional mirror
- Host is not written into Graph IR

FAIL:
- Invents a custom registry
- Treats npm unavailability as a failed product release
- Bumps versions to dodge npm E429
- Puts `publishConfig.registry` in package.json pointing at GitHub Packages
