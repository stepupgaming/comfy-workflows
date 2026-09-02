import { describe, expect, it } from "vitest";
import { workflow } from "../src/builder/builder.js";
import { graphHash, instantiateTemplate, parseGraph, serializeGraph } from "../src/ir/index.js";
import { compile } from "../src/compile/index.js";
import { coreDefs } from "./helpers.js";
import * as n from "./specs.js";

describe("IR serialization", () => {
  it("round-trips a graph losslessly, including bigints", () => {
    const g = workflow("rt");
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    const pos = g.add(n.CLIPTextEncode, { text: "hello", clip: ckpt.CLIP });
    const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    const ks = g.add(n.KSampler, {
      model: ckpt.MODEL,
      positive: pos.CONDITIONING,
      negative: pos.CONDITIONING,
      latent_image: latent.LATENT,
      seed: 18446744073709551615n,
      steps: 20,
      cfg: 8,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
    });
    g.output(ks.LATENT, { name: "latent" });

    const text = serializeGraph(g.toGraph(), { pretty: true });
    // Ordinary JSON.parse cannot corrupt the tagged seed:
    const naive = JSON.parse(text);
    expect(naive.nodes.n4.params.seed).toEqual({ $int: "18446744073709551615" });

    const reparsed = parseGraph(text);
    expect(reparsed.nodes["n4"].params["seed"]).toBe(18446744073709551615n);
    expect(graphHash(reparsed)).toBe(graphHash(g.toGraph()));
    expect(reparsed.outputs).toEqual([{ node: "n4", out: 0, name: "latent" }]);
  });
});

describe("templates", () => {
  function template() {
    const g = workflow("tpl");
    const seed = g.param("seed", { type: "int", default: 42n });
    const prompt = g.param("prompt", { type: "string" });
    const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
    const pos = g.add(n.CLIPTextEncode, { text: prompt, clip: ckpt.CLIP });
    const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    const ks = g.add(n.KSampler, {
      model: ckpt.MODEL,
      positive: pos.CONDITIONING,
      negative: pos.CONDITIONING,
      latent_image: latent.LATENT,
      seed,
      steps: 20,
      cfg: 8,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
    });
    g.output(ks.LATENT);
    return g.toGraph();
  }

  it("instantiates with bindings and applies defaults", () => {
    const a = instantiateTemplate(template(), {
      params: { prompt: "hello", seed: 18446744073709551615n },
    });
    expect(a.nodes["n4"].params["seed"]).toBe(18446744073709551615n);
    expect(a.nodes["n2"].params["text"]).toBe("hello");
    // renumbered 1..4 deterministically
    expect(Object.keys(a.nodes)).toEqual(["n1", "n2", "n3", "n4"]);

    const b = instantiateTemplate(template(), { params: { prompt: "hello" } });
    expect(b.nodes["n4"].params["seed"]).toBe(42n); // default applied
  });

  it("throws E_UNBOUND_PARAM for missing params without defaults", () => {
    expect(() => instantiateTemplate(template(), {})).toThrowError(/prompt/);
  });

  it("is deterministic: same template + bindings → byte-identical compile", () => {
    const a = compile(instantiateTemplate(template(), { params: { prompt: "same" } }), coreDefs);
    const b = compile(instantiateTemplate(template(), { params: { prompt: "same" } }), coreDefs);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.json).toBe(b.json);
  });
});
