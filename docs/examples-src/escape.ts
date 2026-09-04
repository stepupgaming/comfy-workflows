import { unsafe, workflow } from "@stepupgaming/comfy-workflows";
import { loaders } from "@stepupgaming/comfy-workflows/nodes";

/**
 * rawNode is for classes your defs snapshot cannot describe.
 * It is not the normal custom-node path. Prefer codegen from /object_info.
 */
export function unknownClassGraph() {
  const g = workflow("escape");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const mystery = g.rawNode(
    "SomeUnregisteredNode",
    { model: ckpt.MODEL, strength: 0.5 },
    { outputs: [{ name: "MODEL", type: "MODEL" }] },
  );
  void mystery.out(0);
  void unsafe(ckpt.MODEL);
  return g.toGraph();
}
