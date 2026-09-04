/**
 * Bundled core nodes use the same spec shape codegen emits for custom nodes.
 * After `cwf codegen -o comfy-nodes`, import from that directory instead.
 */
import { CheckpointLoaderSimple, CLIPTextEncode, KSampler } from "@stepupgaming/comfy-workflows/nodes";
import { workflow } from "@stepupgaming/comfy-workflows";

export function usesNamedSpecs() {
  const g = workflow("named-specs");
  const ckpt = g.add(CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const pos = g.add(CLIPTextEncode, { text: "hello", clip: ckpt.CLIP });
  void KSampler;
  void pos;
  return g.toGraph();
}
