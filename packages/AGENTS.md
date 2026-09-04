# Agent notes for `packages/`

First-party workflow packages (`workflow-t2i`, `workflow-hires`).

## What to edit

| File | Edit? |
| ---- | ----- |
| `ir.build.ts` | Yes. This is the authored graph. |
| `package.json` | Yes, for name/version/description. |
| `README.md` | Yes, but changing it changes the packed tarball. |
| `workflow.ir.json` | No. Produced by `pnpm build:packages`. |
| `comfy.workflow.json` | No. Derived at build. |
| `src/` compile glue | Only if the build pipeline needs it. |

After editing `ir.build.ts`:

```sh
pnpm build:packages
```

CI fails if generated IR/manifest drift (`git diff --exit-code packages/*/workflow.ir.json packages/*/comfy.workflow.json`).

Do not republish t2i/hires as a new version solely because core docs or distribution automation changed. Bump a workflow package only when its graph or package metadata actually change.
