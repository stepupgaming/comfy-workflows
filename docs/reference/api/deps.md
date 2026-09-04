# Dependency / setup API

`@stepupgaming/comfy-workflows/deps`

| Symbol | Purpose |
| ------ | ------- |
| `createRegistryClient` | Comfy Registry HTTP |
| `resolveNodeClasses` | CORE / RESOLVED_CUSTOM / AMBIGUOUS / UNKNOWN |
| `buildDependencyReport` | Inspect-time report |
| `createSetupPlan` / `applySetupPlan` | Plan + Manager install |
| `inspectComfyTarget` / `assertComfyPath` | Local Comfy layout |
| `isCoreNodeClass` | Bundled core + known extras |
| `pickTargetPython` | `python_embeded` on portable Windows |

`inspect` and `run` never call `applySetupPlan`.

[Custom nodes](/guide/custom-nodes)
