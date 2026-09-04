# Eval: modify a code-authored workflow

TASK:
Change the sampler on an existing first-party package (edit steps or sampler_name on KSampler).

PASS:
- Opens `ir.build.ts` (or `workflow.ts` if that is the authored source)
- Rebuilds generated IR
- Diff of `workflow.ir.json` is a consequence of the TypeScript change
- Does not patch generated files to “match”

FAIL:
- Edits `workflow.ir.json` or compiled prompt JSON
- Hardcodes node ids in a runtime binder
- Reimplements compile
