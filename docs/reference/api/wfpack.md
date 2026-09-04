# Workflow package API

`@stepupgaming/comfy-workflows/wfpack`

| Symbol | Purpose |
| ------ | ------- |
| `WORKFLOW_MANIFEST_FILENAME` | `"comfy.workflow.json"` |
| `WORKFLOW_PACKAGE_JSON_KEY` | `"comfyWorkflow"` |
| `parse` / validate manifest | Throws `ComfyError` on bad documents |
| `discoverPackage` | Locate manifest + IR without executing JS |
| `checkPackageCoherence` | Params/outputs/classes vs IR |
| `exposeParam` | Promote a widget to a parameter |
| `suggestParams` | Read-only heuristics |
| `generatePackage` / init | Used by `cwf init` |
| `analyzePortability` | Absolute paths, checkpoints |
| `deriveNodeClasses` | Classes used in IR |

Consumers should prefer `cwf inspect` / `cwf pack` unless they are building another tool.

[Manifest](/reference/manifest) · [Packages](/migrate/package)
