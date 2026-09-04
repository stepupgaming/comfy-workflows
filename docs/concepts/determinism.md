# Determinism

Same graph + same defs → byte-identical API JSON. Tested.

What that includes:

- Stable node ids in emit order (sorted)
- Inputs emitted in def order
- No hidden RNG in the compiler
- Explicit seeds, recorded in `run.json`
- `graphHash`, compile `hash`, `objectInfoHash`
- `instantiateTemplate` renumbers `n1..nN` in topo order

What it does **not** include:

- GPU bit-identical images across drivers / cards
- Model kernels that are themselves nondeterministic
- Two machines with different checkpoint files that share a name
- Comfy frontend revisions that change `/object_info`

Environment lock reports defs drift. It cannot freeze CUDA.

Replay the **exact** `/prompt` body from `run.json.compiledJson` (as a string). That reproduces the **request**. The pixels are Comfy's problem.

[Locks](/product/locks) · [Reproducible runs](/guide/reproducible-runs)
