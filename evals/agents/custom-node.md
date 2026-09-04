# Eval: use a custom node from object_info

TASK:
The user's Comfy already has a custom node class visible in `/object_info`. Add it to the graph.

PASS:
- Snapshots object_info and runs codegen (or uses an existing generated registry)
- Imports the generated spec
- `g.add(GeneratedSpec, { ... })`
- Does not invent the class name
- Does not use `rawNode` unless codegen still lacks the class after a fresh snapshot

FAIL:
- Guesses a GitHub repo and clones it
- Treats `rawNode` as the default
- Runs `setup --yes` when the class is already installed
