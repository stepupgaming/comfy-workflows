import type { Graph } from "@stepupgaming/comfy-workflows";
import { paramRef } from "@stepupgaming/comfy-workflows";
import { textToImage } from "@stepupgaming/comfy-workflows/recipes";

/**
 * Build the canonical template graph for the t2i workflow package.
 * Checkpoint, prompts, seed, and dimensions are template parameters —
 * the package ships no machine-local filenames.
 */
export function buildTemplate(): Graph {
  const graph = textToImage({
    checkpoint: paramRef("checkpoint"),
    positivePrompt: paramRef("prompt"),
    negativePrompt: paramRef("negative"),
    seed: paramRef("seed"),
    width: paramRef("width"),
    height: paramRef("height"),
  });
  // Enrich the recipe-declared placeholders with package-facing metadata.
  // (The recipe declares names/types; descriptions + dimension defaults
  // live with the package.)
  const meta = {
    checkpoint: { description: "Checkpoint file present on the ComfyUI server." },
    prompt: { description: "Positive prompt." },
    negative: { description: "Negative prompt." },
    seed: { description: "Sampling seed." },
    width: { description: "Image width.", default: 512 },
    height: { description: "Image height.", default: 512 },
  } as const;
  for (const [name, m] of Object.entries(meta)) {
    const def = graph.params?.[name];
    if (def) {
      if (m.description !== undefined) def.description = m.description;
      if ("default" in m && def.default === undefined) def.default = m.default;
    }
  }
  return graph;
}

/** Static manifest fields; parameters + nodeClasses are derived from the IR at build time. */
export const manifestMeta = {
  name: "text-to-image",
  title: "Text to Image",
  description:
    "Baseline text-to-image: checkpoint → prompt encodes → KSampler → VAE decode → save.",
  outputs: [{ name: "image", type: "IMAGE" }],
  models: [{ kind: "checkpoint", name: "checkpoint (see parameters)", optional: false }],
  compatibility: {
    notes:
      "Needs any SD1.x/SDXL-compatible checkpoint on the server, passed as the checkpoint parameter.",
  },
};
