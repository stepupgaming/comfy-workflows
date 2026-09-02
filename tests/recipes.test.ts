import { describe, expect, it } from "vitest";
import { compile } from "../src/compile/index.js";
import { instantiateTemplate } from "../src/ir/template.js";
import { explainGraph } from "../src/recipes/explain.js";
import { hiresFix, upscale, withControlNet, withLora } from "../src/recipes/compose.js";
import { img2img, inpaint, outpaint } from "../src/recipes/imageOps.js";
import { textToImage } from "../src/recipes/textToImage.js";
import { coreDefs } from "./helpers.js";

const BASE = {
  checkpoint: "v1-5-pruned-emaonly.safetensors",
  positivePrompt: "a lighthouse at dusk",
  seed: 42n,
} as const;

function expectCompiles(graph: ReturnType<typeof textToImage>) {
  const result = compile(graph, coreDefs);
  if (!result.ok)
    throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
  return result;
}

describe("recipes", () => {
  it("textToImage expands into exactly 7 nodes and compiles", () => {
    const g = textToImage(BASE);
    expect(Object.keys(g.nodes).length).toBe(7);
    expectCompiles(g);
  });

  it("is deterministic: same options → byte-identical compile", () => {
    const a = expectCompiles(textToImage(BASE)).json;
    const b = expectCompiles(textToImage(BASE)).json;
    expect(a).toBe(b);
  });

  it("explain() prints the expansion for agents", () => {
    const text = explainGraph(textToImage(BASE));
    expect(text).toContain("n1: CheckpointLoaderSimple");
    expect(text).toContain("n5: KSampler");
    expect(text).toContain("seed=42n");
  });

  it("withLora inserts a LoRA loader between checkpoint and sampler", () => {
    const g = withLora(textToImage(BASE), {
      lora_name: "detail_tweaker.safetensors",
      strength_model: 0.8,
    });
    expect(Object.keys(g.nodes).length).toBe(8);
    const lora = Object.values(g.nodes).find((n) => n.type === "LoraLoader");
    expect(lora).toBeDefined();
    const sampler = Object.values(g.nodes).find((n) => n.type === "KSampler");
    expect(sampler?.inputs["model"]).toEqual({
      node:
        lora!.type === "LoraLoader" ? Object.keys(g.nodes).find((id) => g.nodes[id] === lora) : "",
      out: 0,
    });
    expectCompiles(g);
  });

  it("withControlNet inserts loader + apply + image load", () => {
    const g = withControlNet(textToImage(BASE), {
      control_net_name: "control_v11p_sd15_canny.safetensors",
      image: "control-input.png",
      strength: 0.9,
    });
    const types = Object.values(g.nodes)
      .map((n) => n.type)
      .sort();
    expect(types).toContain("ControlNetLoader");
    expect(types).toContain("ControlNetApplyAdvanced");
    const sampler = Object.values(g.nodes).find((n) => n.type === "KSampler");
    const applyId = Object.keys(g.nodes).find(
      (id) => g.nodes[id].type === "ControlNetApplyAdvanced",
    );
    expect(sampler?.inputs["positive"]).toEqual({ node: applyId, out: 0 });
    expect(sampler?.inputs["negative"]).toEqual({ node: applyId, out: 1 });
    expectCompiles(g);
  });

  it("hiresFix adds latent upscale + second sampling pass", () => {
    const g = hiresFix(textToImage(BASE), { scaleBy: 1.5, denoise: 0.45 });
    const types = Object.values(g.nodes)
      .map((n) => n.type)
      .sort();
    expect(types).toContain("LatentUpscaleBy");
    expect(types).toContain("KSamplerAdvanced");
    expect(Object.keys(g.nodes).length).toBe(9);
    expectCompiles(g);
  });

  it("upscale appends a model-based image upscale", () => {
    const g = upscale(textToImage(BASE), {
      model_name: "4x-ultrasharp.pth",
      resizeTo: { width: 2048, height: 2048 },
    });
    const types = Object.values(g.nodes)
      .map((n) => n.type)
      .sort();
    expect(types).toContain("UpscaleModelLoader");
    expect(types).toContain("ImageUpscaleWithModel");
    expect(types).toContain("ImageScale");
    expectCompiles(g);
  });

  it("template params survive composition and instantiate after transforms", () => {
    const seedParam = { $param: "seed" } as const;
    const g = withLora(textToImage({ ...BASE, seed: seedParam }), {
      lora_name: "detail_tweaker.safetensors",
    });
    expect(g.params?.["seed"]).toBeDefined();
    const concrete = instantiateTemplate(g, { params: { seed: 123n } });
    const sampler = Object.values(concrete.nodes).find((n) => n.type === "KSampler");
    expect(sampler?.params["seed"]).toBe(123n);
    expectCompiles(concrete);
  });

  it("img2img / inpaint / outpaint expand and compile", () => {
    const i2i = img2img({ ...BASE, image: "input.png", denoise: 0.6 });
    expect(Object.keys(i2i.nodes).length).toBe(8);
    expectCompiles(i2i);

    const inp = inpaint({ ...BASE, image: "input.png", mask: "input.png", positivePrompt: "fill" });
    expect(Object.values(inp.nodes).map((n) => n.type)).toContain("VAEEncodeForInpaint");
    expectCompiles(inp);

    const out = outpaint({
      ...BASE,
      image: "input.png",
      right: 512,
      positivePrompt: "extend scene",
    });
    expect(Object.values(out.nodes).map((n) => n.type)).toContain("PadImageForOutpainting");
    expectCompiles(out);
  });
});
