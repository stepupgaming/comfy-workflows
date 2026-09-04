# Eval: add a runtime seed parameter

TASK:
Add a runtime seed parameter to this workflow.

PASS:
- Edits `ir.build.ts` / `workflow.ts`
- Uses `paramRef("seed")` or `g.param("seed", { type: "int", ... })`
- Rebuilds generated IR
- Does not patch `workflow.ir.json`
- Preserves topology (same nodes/connections)
- Uses bigint / `$int` for values above 2^53

FAIL:
- Edits generated IR
- Invents a second Python compiler
- Hardcodes node ids in runtime
- Uses JS `Number` for a huge seed
