import { combo, conn, defineNode, float, int, str } from "../src/builder/types.js";

/**
 * Hand-written specs mirroring the core fixture. These exercise the builder's
 * type machinery independently of codegen; the generated registry is tested
 * separately against the same fixture.
 */

export const CheckpointLoaderSimple = defineNode("CheckpointLoaderSimple", {
  category: "loaders",
  inputs: {
    ckpt_name: combo([
      "v1-5-pruned-emaonly.safetensors",
      "sd_xl_base_1.0.safetensors",
      "flux1-dev.safetensors",
    ]),
  },
  outputs: [
    { name: "MODEL", type: "MODEL" },
    { name: "CLIP", type: "CLIP" },
    { name: "VAE", type: "VAE" },
  ] as const,
});

export const CLIPTextEncode = defineNode("CLIPTextEncode", {
  category: "conditioning",
  inputs: {
    text: str({ multiline: true, default: "" }),
    clip: conn("CLIP"),
  },
  outputs: [{ name: "CONDITIONING", type: "CONDITIONING" }] as const,
});

export const EmptyLatentImage = defineNode("EmptyLatentImage", {
  category: "latent",
  inputs: {
    width: int({ default: 512, min: 16, max: 16384, step: 8 }),
    height: int({ default: 512, min: 16, max: 16384, step: 8 }),
    batch_size: int({ default: 1, min: 1, max: 4096 }),
  },
  outputs: [{ name: "LATENT", type: "LATENT" }] as const,
});

export const KSampler = defineNode("KSampler", {
  category: "sampling",
  inputs: {
    model: conn("MODEL"),
    seed: int({ default: 0, controlAfterGenerate: true, min: 0 }),
    steps: int({ default: 20, min: 1, max: 10000 }),
    cfg: float({ default: 8, min: 0, max: 100, step: 0.1 }),
    sampler_name: combo(["euler", "euler_ancestral", "dpmpp_2m", "ddim"] as const),
    scheduler: combo(["normal", "karras", "ddim_uniform"] as const),
    positive: conn("CONDITIONING"),
    negative: conn("CONDITIONING"),
    latent_image: conn("LATENT"),
    denoise: float({ default: 1, min: 0, max: 1 }),
  },
  outputs: [{ name: "LATENT", type: "LATENT" }] as const,
});

export const VAEDecode = defineNode("VAEDecode", {
  category: "latent",
  inputs: { samples: conn("LATENT"), vae: conn("VAE") },
  outputs: [{ name: "IMAGE", type: "IMAGE" }] as const,
});

export const VAEEncode = defineNode("VAEEncode", {
  category: "latent",
  inputs: { pixels: conn("IMAGE"), vae: conn("VAE") },
  outputs: [{ name: "LATENT", type: "LATENT" }] as const,
});

export const LoadImage = defineNode("LoadImage", {
  category: "image",
  inputs: { image: combo(["example.png", "photo.jpg", "mask.png"]) },
  outputs: [
    { name: "IMAGE", type: "IMAGE" },
    { name: "MASK", type: "MASK" },
  ] as const,
});

export const SaveImage = defineNode("SaveImage", {
  category: "image",
  inputs: { images: conn("IMAGE"), filename_prefix: str({ default: "ComfyUI" }) },
  outputs: [],
  outputNode: true,
});

export const LoraLoader = defineNode("LoraLoader", {
  category: "loaders",
  inputs: {
    model: conn("MODEL"),
    clip: conn("CLIP"),
    lora_name: combo(["lora1.safetensors", "lora2.safetensors"]),
    strength_model: float({ default: 1, min: -20, max: 20 }),
    strength_clip: float({ default: 1, min: -20, max: 20 }),
  },
  outputs: [
    { name: "MODEL", type: "MODEL" },
    { name: "CLIP", type: "CLIP" },
  ] as const,
});

export const UpscaleModelLoader = defineNode("UpscaleModelLoader", {
  category: "loaders",
  inputs: { model_name: combo(["4x-ultrasharp.pth", "RealESRGAN_x4plus.pth"]) },
  outputs: [{ name: "UPSCALE_MODEL", type: "UPSCALE_MODEL" }] as const,
});

export const ImageUpscaleWithModel = defineNode("ImageUpscaleWithModel", {
  category: "image/upscaling",
  inputs: { upscale_model: conn("UPSCALE_MODEL"), image: conn("IMAGE") },
  outputs: [{ name: "IMAGE", type: "IMAGE" }] as const,
});
