import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { describe, expect, it } from "vitest";
import { generateNodeModules } from "../src/codegen/codegen.js";
import { parseObjectInfo } from "../src/defs/parse.js";
import { importComfyJson } from "../src/import/index.js";
import { emitTs } from "../src/emit-ts/emit.js";
import { compile } from "../src/compile/index.js";
import { workflow } from "../src/builder/builder.js";
import { coreObjectInfo, coreDefs } from "./helpers.js";
import * as coreSpecs from "./specs.js";

const CUSTOM_CLASS = "ComfySDKTestEcho";

function liveStyleObjectInfo(): Record<string, unknown> {
  return {
    ...coreObjectInfo,
    [CUSTOM_CLASS]: {
      input: {
        required: {
          image: [["IMAGE"]],
          strength: ["FLOAT", { default: 1, min: 0, max: 10, step: 0.01 }],
          mode: [["echo", "reverse"]],
        },
      },
      input_order: { required: ["image", "strength", "mode"] },
      output: ["IMAGE"],
      output_name: ["IMAGE"],
      name: "SDK Test Echo",
      category: "comfy_sdk_test",
      output_node: false,
      python_module: "test_echo.py",
    },
  };
}

/** jiti wired with the same aliases the CLI compile path uses. */
function makeJiti() {
  return createJiti(import.meta.url, {
    alias: {
      "@stepupgaming/comfy-workflows/nodes": new URL(
        "../src/nodes/index.ts",
        import.meta.url,
      ).pathname.replace(/^\/([A-Z]:)/, "$1"),
      "@stepupgaming/comfy-workflows": new URL("../src/index.ts", import.meta.url).pathname.replace(
        /^\/([A-Z]:)/,
        "$1",
      ),
    },
  });
}

describe("TS-emitter correctness regressions (pre-freeze)", () => {
  it("colliding classTypes: BOTH registry identifiers appear in g.add and the file loads + compiles", async () => {
    // "My Node!" and "My-Node?" both sanitize to My_Node — codegen suffixes the
    // second. The e2e proof: emitted imports AND g.add expressions use the two
    // DISTINCT generated identifiers, and the file loads + compiles.
    const defs = parseObjectInfo({
      ...coreObjectInfo,
      "My Node!": {
        input: { required: { image: [["IMAGE"]] } },
        output: ["IMAGE"],
        output_name: ["IMAGE"],
        name: "My Node A",
        category: "test/collide",
      },
      "My-Node?": {
        input: { required: { image: [["IMAGE"]] } },
        output: ["IMAGE"],
        output_name: ["IMAGE"],
        name: "My Node B",
        category: "test/collide",
      },
    } as never);
    const outDir = mkdtempSync(join(tmpdir(), "comfy-collide-"));

    const genDir = join(outDir, "comfy-nodes");
    const generated = generateNodeModules({
      defs,
      objectInfoHash: "collide",
      importsFrom: "@stepupgaming/comfy-workflows",
    });
    mkdirSync(genDir, { recursive: true });
    for (const f of generated.files) writeFileSync(join(genDir, f.path), f.content);
    const idA = generated.identifiers["My Node!"];
    const idB = generated.identifiers["My-Node?"];
    expect(idA).not.toBe(idB);

    const workflowJson = {
      "1": { class_type: "LoadImage", inputs: { image: "in.png" }, _meta: { title: "img" } },
      "2": { class_type: "My Node!", inputs: { image: ["1", 0] }, _meta: { title: "a" } },
      "3": { class_type: "My-Node?", inputs: { image: ["2", 0] }, _meta: { title: "b" } },
      "4": {
        class_type: "SaveImage",
        inputs: { images: ["3", 0], filename_prefix: "collide" },
        _meta: { title: "save" },
      },
    };
    const { graph } = importComfyJson(workflowJson, defs);

    const ts = emitTs(graph, {
      defs,
      registries: [
        {
          specifier: "./comfy-nodes/registry.js",
          classes: new Set(Object.keys(defs)),
          identifiers: new Map(Object.entries(generated.identifiers)),
        },
      ],
    });
    const tsPath = join(outDir, "workflow.ts");
    writeFileSync(tsPath, ts);

    // The g.add expressions use the resolved identifiers, not node.type.
    expect(ts).toContain(`g.add(${idA},`);
    expect(ts).toContain(`g.add(${idB},`);
    expect(ts).not.toContain('g.add("My Node!"');
    expect(ts).not.toContain('g.add("My-Node?"');
    // Imports carry the same identifiers.
    expect(ts).toContain(`import { ${idA}, ${idB} } from "./comfy-nodes/registry.js";`);

    const mod = (await makeJiti().import(tsPath)) as { build: () => Parameters<typeof compile>[0] };
    const rebuilt = mod.build();

    expect(rebuilt.nodes["2"]?.raw).toBeUndefined();
    expect(rebuilt.nodes["3"]?.raw).toBeUndefined();
    expect(rebuilt.nodes["2"]?.type).toBe("My Node!");
    expect(rebuilt.nodes["3"]?.type).toBe("My-Node?");
    expect(rebuilt.nodes["2"]?.inputs["image"]).toEqual({ node: "1", out: 0 });
    expect(rebuilt.nodes["3"]?.inputs["image"]).toEqual({ node: "2", out: 0 });

    const result = compile(rebuilt, defs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    expect(result.json).toContain('"My Node!"');
    expect(result.json).toContain('"My-Node?"');
  }, 30_000);

  it("registry-unknown raw node preserves connections (incl. lists), id, title through emit+reload", async () => {
    const defs = parseObjectInfo(liveStyleObjectInfo() as never);
    const outDir = mkdtempSync(join(tmpdir(), "comfy-emit-"));
    const workflowJson = {
      "1": { class_type: "LoadImage", inputs: { image: "in.png" }, _meta: { title: "img" } },
      "2": {
        class_type: CUSTOM_CLASS,
        inputs: {
          image: ["1", 0],
          frames: [
            ["1", 0],
            ["1", 1],
          ],
          strength: 0.5,
          mode: "echo",
        },
        _meta: { title: "echo node" },
      },
      "3": {
        class_type: "SaveImage",
        inputs: { images: ["2", 0], filename_prefix: "echo" },
        _meta: { title: "save" },
      },
    };
    const { graph: original } = importComfyJson(workflowJson, defs);

    // No registries: the custom class is registry-unknown → rawNode fallback.
    const ts = emitTs(original, { defs });
    const tsPath = join(outDir, "workflow.ts");
    writeFileSync(tsPath, ts);
    expect(ts).toContain('g.rawNode("ComfySDKTestEcho"');
    // Connections ARE emitted (single + array), not dropped.
    expect(ts).toContain('"image": unsafeRef(');
    expect(ts).toContain('"frames": [unsafeRef(');

    const mod = (await makeJiti().import(tsPath)) as { build: () => Parameters<typeof compile>[0] };
    const rebuilt = mod.build();

    // SEMANTIC EQUALITY: the custom node still receives the LoadImage output
    // (single + array connections), with the original id and title preserved.
    expect(rebuilt.nodes["2"]).toBeDefined();
    expect(rebuilt.nodes["2"].type).toBe("ComfySDKTestEcho");
    expect(rebuilt.nodes["2"].inputs["image"]).toEqual(original.nodes["2"].inputs["image"]);
    expect(rebuilt.nodes["2"].inputs["image"]).toEqual({ node: "1", out: 0 });
    expect(rebuilt.nodes["2"].inputs["frames"]).toEqual([
      { node: "1", out: 0 },
      { node: "1", out: 1 },
    ]);
    expect(rebuilt.nodes["2"].title).toBe("echo node");
    expect(rebuilt.nodes["2"].params["strength"]).toBe(0.5);
    expect(rebuilt.nodes["2"].mode).toBeUndefined();

    const result = compile(rebuilt, defs);
    if (!result.ok)
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    const obj = JSON.parse(result.json) as Record<string, { inputs: Record<string, unknown> }>;
    expect(obj["2"].inputs["image"]).toEqual(["1", 0]);
    expect(obj["2"].inputs["frames"]).toEqual([
      ["1", 0],
      ["1", 1],
    ]);
  }, 30_000);

  it("explicit bypassMap survives TS emission for typed AND raw nodes, with identical lowering", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "comfy-bypass-"));
    const g = workflow("bypass-roundtrip");
    const ckpt = g.add(coreSpecs.CheckpointLoaderSimple, {
      ckpt_name: "v1-5-pruned-emaonly.safetensors",
    });
    const lora = g.add(coreSpecs.LoraLoader, {
      model: ckpt.MODEL,
      clip: ckpt.CLIP,
      lora_name: "lora1.safetensors",
      strength_model: 0.7,
      strength_clip: 0.7,
    });
    // Typed bypassed node with an explicit map.
    g.setMode(lora.id, "bypassed");
    g.setBypassMap(lora.id, { 0: "model", 1: "clip" });
    // RAW bypassed node with an explicit map.
    const rawPass = g.rawNode(
      "RawVaePassthrough",
      { a: ckpt.VAE },
      { outputs: [{ name: "VAE", type: "VAE" }] },
    );
    g.setMode(rawPass.id, "bypassed");
    g.setBypassMap(rawPass.id, { 0: "a" });
    const pos = g.add(coreSpecs.CLIPTextEncode, { text: "p", clip: lora.CLIP });
    const lat = g.add(coreSpecs.EmptyLatentImage, { width: 64, height: 64, batch_size: 1 });
    const ks = g.add(coreSpecs.KSampler, {
      model: lora.MODEL,
      positive: pos.CONDITIONING,
      negative: pos.CONDITIONING,
      latent_image: lat.LATENT,
      seed: 42n,
      steps: 2,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
    });
    const dec = g.add(coreSpecs.VAEDecode, { samples: ks.LATENT, vae: rawPass.slots[0] });
    g.add(coreSpecs.SaveImage, { images: dec.IMAGE, filename_prefix: "bypass-rt" });

    const original = g.toGraph();
    const ts = emitTs(original, { defs: coreDefs });
    const tsPath = join(outDir, "workflow.ts");
    writeFileSync(tsPath, ts);
    // Typed and raw nodes alike carry their explicit maps.
    expect(ts).toContain(
      `g.setBypassMap(${JSON.stringify(lora.id)}, { "0": "model", "1": "clip" })`,
    );
    expect(ts).toContain(`g.setBypassMap(${JSON.stringify(rawPass.id)}, { "0": "a" })`);
    expect(ts).toContain(`g.setMode(${JSON.stringify(lora.id)}, "bypassed")`);
    // Raw nodes carry mode via rawNode opts.
    expect(ts).toContain('mode: "bypassed"');

    const mod = (await makeJiti().import(tsPath)) as { build: () => Parameters<typeof compile>[0] };
    const rebuilt = mod.build();

    // Identical bypassMap on the rebuilt graph, typed and raw alike.
    expect(rebuilt.nodes[lora.id]?.bypassMap).toEqual({ 0: "model", 1: "clip" });
    expect(rebuilt.nodes[rawPass.id]?.bypassMap).toEqual({ 0: "a" });
    expect(rebuilt.nodes[lora.id]?.mode).toBe("bypassed");
    expect(rebuilt.nodes[rawPass.id]?.mode).toBe("bypassed");

    // Identical bypass behavior: the rebuilt graph compiles byte-identically.
    const a = compile(original, coreDefs);
    const b = compile(rebuilt, coreDefs);
    if (!a.ok)
      throw new Error(`original compile failed: ${a.errors.map((e) => e.message).join("; ")}`);
    if (!b.ok)
      throw new Error(`rebuilt compile failed: ${b.errors.map((e) => e.message).join("; ")}`);
    expect(b.json).toBe(a.json);
  }, 30_000);
});
