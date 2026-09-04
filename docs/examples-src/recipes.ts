import {
  hiresFix,
  instantiateTemplate,
  paramRef,
  textToImage,
  withLora,
  type Graph,
} from "@stepupgaming/comfy-workflows";
import { explainGraph } from "@stepupgaming/comfy-workflows/recipes";

export function composed(): Graph {
  const tpl = textToImage({
    checkpoint: paramRef("checkpoint"),
    positivePrompt: paramRef("prompt"),
    seed: paramRef("seed"),
    width: 512,
    height: 512,
  });
  const withStyle = withLora(tpl, [
    { lora_name: "detail_tweaker.safetensors", strength_model: 0.8, strength_clip: 0.8 },
  ]);
  return hiresFix(withStyle, { scaleBy: 1.5, denoise: 0.45 });
}

export function expansion(): string {
  return explainGraph(composed());
}

export function bound(): Graph {
  return instantiateTemplate(composed(), {
    params: {
      checkpoint: "v1-5-pruned-emaonly.safetensors",
      prompt: "a lighthouse at dusk",
      seed: 42n,
    },
  });
}
