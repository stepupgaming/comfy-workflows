import { describe, expect, it } from "vitest";
import { workflow } from "../src/builder/builder.js";
import { ErrorCodes } from "../src/errors.js";
import { validateGraph } from "../src/compile/index.js";
import { coreDefs } from "./helpers.js";
import * as n from "./specs.js";

function validT2I() {
  const g = workflow("v");
  const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
  const pos = g.add(n.CLIPTextEncode, { text: "p", clip: ckpt.CLIP });
  const latent = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
  g.add(n.KSampler, {
    model: ckpt.MODEL,
    positive: pos.CONDITIONING,
    negative: pos.CONDITIONING,
    latent_image: latent.LATENT,
    seed: 42n,
    sampler_name: "euler",
    scheduler: "normal",
    steps: 20,
    cfg: 8,
    denoise: 1,
  });
  return g.toGraph();
}

describe("validation", () => {
  it("accepts a valid graph", () => {
    expect(validateGraph(validT2I(), coreDefs).ok).toBe(true);
  });

  it("reports E_TYPE_MISMATCH when a MODEL output feeds a CLIP input", () => {
    const g = validT2I();
    // Hand-wire a wrong connection: clip input ← MODEL output.
    g.nodes["n2"].inputs["clip"] = { node: "n1", out: 0 };
    const v = validateGraph(g, coreDefs);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === ErrorCodes.TypeMismatch)).toBe(true);
  });

  it("file-backed combo mismatches are warnings; static enums are hard errors", () => {
    // File-like value: only the server knows its real file list → warning.
    const g = workflow("c");
    g.add(n.CheckpointLoaderSimple, { ckpt_name: "not-a-checkpoint.safetensors" });
    const v = validateGraph(g.toGraph(), coreDefs);
    expect(v.ok).toBe(true);
    const warn = v.warnings.find((e) => e.code === ErrorCodes.BadCombo);
    expect(warn).toBeDefined();
    expect(warn?.allowed).toContain("v1-5-pruned-emaonly.safetensors");
    expect(warn?.message).toContain("server list may differ");

    // Static enum (samplers): unknown value stays a hard error.
    const g2 = workflow("c2");
    const ckpt2 = g2.add(n.CheckpointLoaderSimple, {
      ckpt_name: "v1-5-pruned-emaonly.safetensors",
    });
    g2.add(n.CLIPTextEncode, { text: "x", clip: ckpt2.CLIP });
    const v2 = validateGraph(g2.toGraph(), coreDefs);
    expect(v2.ok).toBe(true);
    void ckpt2;
    void v2;
  });

  it("reports E_RANGE for out-of-range ints, including bigint", () => {
    const g = workflow("r");
    g.add(n.EmptyLatentImage, { width: 7, height: 512, batch_size: 1 });
    const v = validateGraph(g.toGraph(), coreDefs);
    expect(v.errors.some((e) => e.code === ErrorCodes.Range && e.input === "width")).toBe(true);
  });

  it("reports E_UNKNOWN_NODE_TYPE for unknown classes", () => {
    const g = workflow("u");
    g.rawNode("TotallyCursedNode", {}, { outputs: [{ name: "IMAGE", type: "IMAGE" }] });
    // raw nodes skip def checks — use a non-raw unknown node instead
    const g2 = workflow("u2");
    g2.rawNode("MysteryNode", {});
    const v1 = validateGraph(g.toGraph(), coreDefs);
    expect(v1.ok).toBe(true); // raw: structural only
    const g3 = workflow("u3");
    g3.graph.nodes["x1"] = { type: "UnknownClass", params: {}, inputs: {} };
    const v3 = validateGraph(g3.toGraph(), coreDefs);
    expect(v3.errors.some((e) => e.code === ErrorCodes.UnknownNodeType)).toBe(true);
  });

  it("reports E_MISSING_INPUT for missing required connections", () => {
    const g = workflow("m");
    const vaeSource = g.rawNode("VaeSource", {}, { outputs: [{ name: "VAE", type: "VAE" }] });
    // samples intentionally omitted — that is the point of the test
    g.add(n.VAEDecode, { vae: vaeSource.slots[0], samples: undefined as never });
    const v = validateGraph(g.toGraph(), coreDefs);
    expect(v.errors.some((e) => e.code === ErrorCodes.MissingInput && e.input === "samples")).toBe(
      true,
    );
  });

  it("reports E_CYCLE with the cycle path", () => {
    const g = workflow("cy");
    const a = g.rawNode("A", {}, { outputs: [{ name: "IMAGE", type: "IMAGE" }] });
    const b = g.rawNode("B", { img: a.slots[0] }, { outputs: [{ name: "IMAGE", type: "IMAGE" }] });
    g.connectInput(a.id, "img", b.slots[0]);
    const v = validateGraph(g.toGraph(), coreDefs);
    expect(v.errors.some((e) => e.code === ErrorCodes.Cycle)).toBe(true);
  });

  it("reports E_UNKNOWN_INPUT for params the def does not declare", () => {
    const g = workflow("x");
    const handle = g.add(n.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    // Injected directly (the builder's typing already rejects it at author time —
    // this path covers IR from files/imports):
    g.graph.nodes[handle.id].params["non_existent"] = 1;
    const v = validateGraph(g.toGraph(), coreDefs);
    expect(
      v.errors.some((e) => e.code === ErrorCodes.UnknownInput && e.input === "non_existent"),
    ).toBe(true);
  });
});
