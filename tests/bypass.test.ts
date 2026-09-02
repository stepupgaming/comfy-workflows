import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { workflow } from "../src/builder/builder.js";
import { lowerBypass } from "../src/compile/index.js";
import { ErrorCodes } from "../src/errors.js";
import { coreDefs } from "./helpers.js";
import * as n from "./specs.js";
import { importComfyJson } from "../src/import/index.js";

/** ckpt → lora(bypassed?) → pos-encode → sampler */
function base() {
  const g = workflow("bypass");
  const ckpt = g.add(n.CheckpointLoaderSimple, { ckpt_name: "v1-5-pruned-emaonly.safetensors" });
  const pos = g.add(n.CLIPTextEncode, { text: "p", clip: ckpt.CLIP });
  return { g, ckpt, pos };
}

describe("bypass lowering (explicit mappings only — no type-match guessing)", () => {
  it("does NOT infer pass-through from a single same-typed input: E_UNRESOLVED_BYPASS", () => {
    const { g, ckpt, pos } = base();
    const lora = g.add(n.LoraLoader, {
      model: ckpt.MODEL,
      clip: ckpt.CLIP,
      lora_name: "lora1.safetensors",
      strength_model: 1,
      strength_clip: 1,
    });
    // pos's clip flows through the lora; lora bypassed with NO bypassMap.
    g.graph.nodes[pos.id].inputs["clip"] = { node: lora.id, out: 1 };
    g.setMode(lora.id, "bypassed");

    // Even though the lora has exactly one connected CLIP input, the compiler
    // must not guess that pass-through semantics. It reports the ambiguity of
    // intent instead of silently compiling a different graph.
    const { errors } = lowerBypass(g.toGraph(), coreDefs);
    const unresolved = errors.find((e) => e.code === ErrorCodes.UnresolvedBypass);
    expect(unresolved).toBeDefined();
    expect(unresolved?.message).toContain("no bypassMap entry");
  });

  it("reports E_UNRESOLVED_BYPASS when two same-typed inputs exist and no mapping is given", () => {
    const { g, ckpt } = base();
    // A raw node with TWO connected IMAGE inputs and an IMAGE output — the
    // ambiguous case Comfy's frontend resolves by its own (node-specific)
    // semantics. Without an explicit map this must never silently resolve.
    const imgA = g.rawNode("ImageA", {}, { outputs: [{ name: "IMAGE", type: "IMAGE" }] });
    const imgB = g.rawNode("ImageB", {}, { outputs: [{ name: "IMAGE", type: "IMAGE" }] });
    const sink = g.rawNode(
      "AmbiguousPassthrough",
      { imgA: imgA.slots[0], imgB: imgB.slots[0] },
      { outputs: [{ name: "IMAGE", type: "IMAGE" }] },
    );
    const consumer = g.rawNode("Sink2", { img: sink.slots[0] }, {});
    g.setMode(sink.id, "bypassed");
    void consumer;

    const { errors } = lowerBypass(g.toGraph(), coreDefs);
    const unresolved = errors.find((e) => e.code === ErrorCodes.UnresolvedBypass);
    expect(unresolved).toBeDefined();
    expect(unresolved?.nodeId).toBe(sink.id);
  });

  it("resolves via explicit bypassMap", () => {
    const { g, ckpt, pos } = base();
    const lora = g.add(n.LoraLoader, {
      model: ckpt.MODEL,
      clip: ckpt.CLIP,
      lora_name: "lora1.safetensors",
      strength_model: 1,
      strength_clip: 1,
    });
    g.graph.nodes[pos.id].inputs["clip"] = { node: lora.id, out: 1 };
    g.setMode(lora.id, "bypassed");
    g.setBypassMap(lora.id, { 1: "clip" });

    const { graph, errors } = lowerBypass(g.toGraph(), coreDefs);
    expect(errors).toEqual([]);
    // pos's clip resolves back to ckpt.CLIP (the mapped lora CLIP input).
    expect(graph.nodes[pos.id].inputs["clip"]).toEqual({ node: ckpt.id, out: 1 });
    // Bypassed node dropped.
    expect(graph.nodes[lora.id]).toBeUndefined();
  });

  it("the importer derives bypassMap for unambiguous bypassed nodes", () => {
    // Editor-format fixture: bypassed LoraLoader (node 7) with model/clip
    // connected; outputs MODEL/CLIP map 1:1 to same-typed inputs.
    const doc = JSON.parse(
      readFileSync(new URL("../fixtures/workflows/t2i.ui.json", import.meta.url), "utf8") as string,
    );
    const { graph } = importComfyJson(doc, coreDefs);
    expect(graph.nodes["7"].mode).toBe("bypassed");
    expect(graph.nodes["7"].bypassMap).toEqual({ 0: "model", 1: "clip" });
  });

  it("reports E_MUTED_CONSUMED when a muted node is still referenced", () => {
    const { g, ckpt, pos } = base();
    g.graph.nodes[pos.id].inputs["clip"] = { node: ckpt.id, out: 1 };
    g.setMode(ckpt.id, "muted");
    const { errors } = lowerBypass(g.toGraph(), coreDefs);
    expect(errors.some((e) => e.code === ErrorCodes.MutedConsumed)).toBe(true);
  });
});
