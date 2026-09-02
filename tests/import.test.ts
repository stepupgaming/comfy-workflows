import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalComfyJson, compile } from "../src/compile/index.js";
import { importComfyJson, importApiJson, detectComfyFormat } from "../src/import/index.js";
import { parseGraph, serializeGraph } from "../src/ir/index.js";
import { parseJsonLossless } from "../src/lossless-parse.js";
import { coreDefs } from "./helpers.js";

const readFixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/workflows/${name}`, import.meta.url)), "utf8");

describe("API-format import", () => {
  it("detects formats", () => {
    expect(detectComfyFormat(JSON.parse(readFixture("t2i.api.json")))).toBe("api");
    expect(detectComfyFormat(JSON.parse(readFixture("t2i.ui.json")))).toBe("editor");
    expect(detectComfyFormat(JSON.parse(readFixture("t2i.ui.v1.json")))).toBe("editor");
  });

  it("imports workflow-v1 schema identically to the v0.4 equivalent", () => {
    const v04 = importComfyJson(JSON.parse(readFixture("t2i.ui.json")), coreDefs);
    const v1 = importComfyJson(JSON.parse(readFixture("t2i.ui.v1.json")), coreDefs);
    expect(v1.diagnostics).toEqual([]);
    // Same graph, same ids, same modes, same primitive-derived seed.
    expect(Object.keys(v1.graph.nodes).sort()).toEqual(Object.keys(v04.graph.nodes).sort());
    expect(v1.graph.nodes["8"].params["seed"]).toBe(987654321);
    expect(v1.graph.nodes["7"].mode).toBe("bypassed");
    expect(v1.graph.nodes["7"].bypassMap).toBeUndefined();
    expect(v1.graph.nodes["2"].inputs["clip"]).toEqual({ node: "7", out: 1 });
    // v1 records its schema version in the source metadata.
    expect(v1.graph.nodes["8"].source?.format).toBe("comfy-workflow-v1");
  });

  it("imports → compiles → canonically equals the original API JSON", () => {
    const originalText = readFixture("t2i.api.json");
    const original = JSON.parse(originalText);
    const graph = importApiJson(original, coreDefs);
    const result = compile(graph, coreDefs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    // Canonical semantic equality — key order is not semantic.
    expect(canonicalComfyJson(JSON.parse(result.json))).toBe(canonicalComfyJson(original));
  });

  it("preserves ids verbatim so server errors map back", () => {
    const graph = importApiJson(JSON.parse(readFixture("t2i.api.json")), coreDefs);
    expect(Object.keys(graph.nodes).sort()).toEqual(["3", "4", "5", "6", "7", "8", "9"]);
  });

  it("keeps giant seeds exact when importing from text (lossless parse)", () => {
    const text = readFixture("t2i.api.json").replace(
      '"seed": 156680208700286',
      '"seed": 18446744073709551615',
    );
    const parsed = parseJsonLossless(text);
    const graph = importApiJson(parsed, coreDefs);
    const seed = graph.nodes["3"].params["seed"];
    expect(seed).toBe(18446744073709551615n);
    const result = compile(graph, coreDefs);
    if (!result.ok) throw new Error("compile failed");
    expect(result.json).toContain('"seed":18446744073709551615');
  });

  it("marks node types missing from defs as raw so imports never fail wholesale", () => {
    const doc = {
      "1": { class_type: "SomeCustomNode", inputs: { value: 5 }, _meta: { title: "Custom" } },
    };
    const graph = importApiJson(doc, coreDefs);
    expect(graph.nodes["1"].raw).toBe(true);
    expect(graph.nodes["1"].params["value"]).toBe(5);
  });
});

describe("editor-format import", () => {
  const { graph, diagnostics } = importComfyJson(JSON.parse(readFixture("t2i.ui.json")), coreDefs);

  it("imports with no diagnostics", () => {
    expect(diagnostics).toEqual([]);
  });

  it("decodes positional widgets against defs, incl. control_after_generate", () => {
    const ks = graph.nodes["8"];
    expect(ks.type).toBe("KSampler");
    expect(ks.params["steps"]).toBe(20);
    expect(ks.params["cfg"]).toBe(8);
    expect(ks.params["sampler_name"]).toBe("euler");
    expect(ks.params["denoise"]).toBe(1);
    expect(ks.params["latent-image" /* absent */]).toBeUndefined();
  });

  it("resolves PrimitiveNode feeds into widget values (overriding positional leftovers)", () => {
    expect(graph.nodes["8"].params["seed"]).toBe(987654321);
    expect(graph.nodes["5"]).toBeUndefined(); // primitive consumed, not a node
  });

  it("resolves Reroute chains", () => {
    expect(graph.nodes["6"]).toBeUndefined(); // reroute consumed
    // encode2's clip traces reroute → bypassed lora.CLIP
    expect(graph.nodes["2"].inputs["clip"]).toEqual({ node: "7", out: 1 });
  });

  it("preserves mode: bypassed lora, muted preview", () => {
    expect(graph.nodes["7"].mode).toBe("bypassed");
    expect(graph.nodes["14"].mode).toBe("muted");
  });

  it("imports Note nodes (registered) and SaveImage defaults output", () => {
    expect(graph.nodes["9"].type).toBe("Note");
    const outNodes = graph.outputs.map((o) => o.node);
    expect(outNodes).toContain("13"); // SaveImage terminal
    expect(outNodes).not.toContain("9"); // Note has no outputs → not an output
  });

  it("reports E_UNRESOLVED_BYPASS for the bypassed lora; explicit mapping resolves it; muted still dropped", () => {
    // New policy: the importer does not infer bypass semantics. Compilation
    // of the raw import fails with a structured E_UNRESOLVED_BYPASS...
    const failed = compile(graph, coreDefs);
    expect(failed.ok).toBe(false);
    const unresolved = (
      failed as { errors: Array<{ code: string; nodeId?: string }> }
    ).errors.filter((e) => e.code === "E_UNRESOLVED_BYPASS");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((e) => e.nodeId === "7")).toBe(true);

    // ...and once the user supplies the explicit mapping (what Comfy's
    // frontend would do for this loader), compilation succeeds: model/clip
    // pass through the checkpoint, the muted preview is dropped, and the
    // primitive-derived seed survives.
    graph.nodes["7"].bypassMap = { 0: "model", 1: "clip" };
    const result = compile(graph, coreDefs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    const obj = JSON.parse(result.json) as Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    expect(obj["8"].inputs["model"]).toEqual(["1", 0]); // through bypassed lora
    expect(obj["2"].inputs["clip"]).toEqual(["1", 1]); // through bypassed lora (reroute traced at compile)
    expect(obj["14"]).toBeUndefined(); // muted preview dropped
    expect(obj["8"].inputs["seed"]).toBe(987654321);
  });

  it("round-trips through IR serialization losslessly", () => {
    const reparsed = parseGraph(serializeGraph(graph, { pretty: true }));
    expect(reparsed.nodes["8"].params["seed"]).toBe(987654321);
    expect(reparsed.nodes["7"].mode).toBe("bypassed");
  });
});
