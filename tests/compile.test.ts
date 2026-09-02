import { describe, expect, it } from "vitest";
import { workflow } from "../src/builder/builder.js";
import { compile } from "../src/compile/index.js";
import { coreDefs } from "./helpers.js";
import * as n from "./specs.js";

describe("builder + compile pipeline", () => {
  it("builds a text→image graph and compiles a golden API JSON", () => {
    const g = workflow("golden-t2i");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    const pos = g.add(n.CLIPTextEncode, { text: "a lighthouse at dusk", clip: ckpt.CLIP });
    const neg = g.add(n.CLIPTextEncode, { text: "blurry", clip: ckpt.CLIP });
    const latent = g.add(n.EmptyLatentImage, { width: 512, height: 768, batch_size: 1 });
    const sampled = g.add(n.KSampler, {
      model: ckpt.MODEL,
      positive: pos.CONDITIONING,
      negative: neg.CONDITIONING,
      latent_image: latent.LATENT,
      seed: 156680208700286,
      steps: 24,
      cfg: 7,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      denoise: 1,
    });
    const decoded = g.add(n.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
    g.add(n.SaveImage, { images: decoded.IMAGE, filename_prefix: "lighthouse" });

    const result = compile(g.toGraph(), coreDefs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);

    const parsed = JSON.parse(result.json) as Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    expect(Object.keys(parsed).sort()).toEqual(
      ["1", "2", "3", "4", "5", "6", "7"].map((x) => `n${x}`),
    );
    const ks = parsed["n5"];
    expect(ks.class_type).toBe("KSampler");
    expect(ks.inputs["model"]).toEqual(["n1", 0]);
    expect(ks.inputs["positive"]).toEqual(["n2", 0]);
    expect(ks.inputs["latent_image"]).toEqual(["n4", 0]);
    expect(ks.inputs["seed"]).toBe(156680208700286);
    expect(ks.inputs["sampler_name"]).toBe("dpmpp_2m");
    // defaults applied from spec: denoise omitted → 1, filename_prefix default
    expect(ks.inputs["denoise"]).toBe(1);
    expect(parsed["n7"].inputs["filename_prefix"]).toBe("lighthouse");
  });

  it("is byte-deterministic: same graph → identical output", () => {
    const build = () => {
      const g = workflow("det");
      const ckpt = g.add(n.CheckpointLoaderSimple, {
        ckpt_name: "v1-5-pruned-emaonly.safetensors",
      });
      const pos = g.add(n.CLIPTextEncode, { text: "x", clip: ckpt.CLIP });
      const neg = g.add(n.CLIPTextEncode, { text: "y", clip: ckpt.CLIP });
      const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
      const sampled = g.add(n.KSampler, {
        model: ckpt.MODEL,
        positive: pos.CONDITIONING,
        negative: neg.CONDITIONING,
        latent_image: latent.LATENT,
        seed: 42n,
        steps: 20,
        cfg: 8,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
      });
      const decoded = g.add(n.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
      g.add(n.SaveImage, { images: decoded.IMAGE, filename_prefix: "ComfyUI" });
      return g.toGraph();
    };
    const a = compile(build(), coreDefs);
    const b = compile(build(), coreDefs);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.json).toBe(b.json);
      expect(a.hash).toBe(b.hash);
    }
  });

  it("keeps bigint seeds exact through compile to the wire form", () => {
    const g = workflow("bigint");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    const pos = g.add(n.CLIPTextEncode, { text: "p", clip: ckpt.CLIP });
    const neg = g.add(n.CLIPTextEncode, { text: "n", clip: ckpt.CLIP });
    const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    g.add(n.KSampler, {
      model: ckpt.MODEL,
      positive: pos.CONDITIONING,
      negative: neg.CONDITIONING,
      latent_image: latent.LATENT,
      seed: 18446744073709551615n,
      steps: 20,
      cfg: 8,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
    });
    const result = compile(g.toGraph(), coreDefs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    expect(result.json).toContain('"seed":18446744073709551615');
  });
});
