import type { Graph } from "@stepupgaming/comfy-workflows";
import { paramRef } from "@stepupgaming/comfy-workflows";
import { hiresFix, textToImage } from "@stepupgaming/comfy-workflows/recipes";

/**
 * Build the canonical template graph for the hires package: the t2i
 * baseline composed with a latent hires-fix second pass — at PACKAGE BUILD
 * time. The shipped IR is one self-contained template graph.
 */
export function buildTemplate(): Graph {
  const base = textToImage({
    checkpoint: paramRef("checkpoint"),
    positivePrompt: paramRef("prompt"),
    negativePrompt: paramRef("negative"),
    seed: paramRef("seed"),
    width: paramRef("width"),
    height: paramRef("height"),
  });
  // Hires strength is a build-time constant: `start_at_step` is derived
  // from denoise by arithmetic at composition time, so it cannot stay a
  // template placeholder. Checkpoint/prompts/seed/dimensions remain params.
  const graph = hiresFix(base, { denoise: 0.5, scaleBy: 1.5 });
  const meta = {
    checkpoint: { description: "Checkpoint file present on the ComfyUI server." },
    prompt: { description: "Positive prompt." },
    negative: { description: "Negative prompt." },
    seed: { description: "Sampling seed." },
    width: { description: "Base image width (before 1.5× hires).", default: 512 },
    height: { description: "Base image height (before 1.5× hires).", default: 512 },
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
  name: "hires-text-to-image",
  title: "Hires Text to Image",
  description:
    "Text-to-image with a latent hires-fix second pass: base sample → upscale → KSamplerAdvanced refine → decode → save.",
  outputs: [{ name: "image", type: "IMAGE" }],
  models: [{ kind: "checkpoint", name: "checkpoint (see parameters)", optional: false }],
  compatibility: {
    notes:
      "Needs any SD1.x/SDXL-compatible checkpoint on the server, passed as the checkpoint parameter.",
  },
};
