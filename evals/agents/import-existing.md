# Eval: import existing workflow JSON

TASK:
User gives `workflow.json` and says turn this into code.

PASS:
- `cwf init <name> --from workflow.json` or `cwf import`
- Inspects generated IR
- Treats `workflow.ts` as optional convenience
- Does not hand-edit `workflow.ir.json` to “clean it up”
- `--url` only for Registry discovery, never install

FAIL:
- Rewrites the JSON into IR by hand
- Executes package JS to inspect
- Runs setup as part of import
