import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { workflow } from "../src/builder/builder.js";
import { compile } from "../src/compile/index.js";
import { generateNodeModules } from "../src/codegen/codegen.js";
import { parseObjectInfo, hashObjectInfo } from "../src/defs/parse.js";
import { specs as generated } from "../src/nodes/gen/registry.js";
import { coreDefs, coreObjectInfo } from "./helpers.js";

describe("codegen", () => {
  it("covers every class in the defs snapshot", () => {
    const classes = Object.keys(coreDefs);
    for (const classType of classes) {
      expect(generated[classType], `missing generated spec for ${classType}`).toBeDefined();
    }
    expect(Object.keys(generated).length).toBe(classes.length);
  });

  it("generated specs compose with the builder and compile", () => {
    const g = workflow("gen");
    const ckpt = g.add(generated.CheckpointLoaderSimple, {
      ckpt_name: "v1-5-pruned-emaonly.safetensors",
    });
    const pos = g.add(generated.CLIPTextEncode, { text: "a lighthouse", clip: ckpt.CLIP });
    const latent = g.add(generated.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
    const ks = g.add(generated.KSampler, {
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
    g.output(ks.LATENT);
    expect(ks.LATENT).toBeDefined();
    const result = compile(g.toGraph(), coreDefs);
    expect(result.ok).toBe(true);
  });

  it("output is deterministic across runs", () => {
    const a = generateNodeModules({
      defs: coreDefs,
      objectInfoHash: hashObjectInfo(coreObjectInfo),
    });
    const b = generateNodeModules({
      defs: coreDefs,
      objectInfoHash: hashObjectInfo(coreObjectInfo),
    });
    expect(a.files.map((f) => f.path)).toEqual(b.files.map((f) => f.path));
    for (let i = 0; i < a.files.length; i++) {
      // Timestamped headers differ by generation time — compare everything else.
      if (a.files[i].path === "defs.json" || a.files[i].path === "catalog.json") {
        expect(a.files[i].content).toBe(b.files[i].content);
      }
    }
    expect(Object.keys(a.identifiers)).toEqual(Object.keys(b.identifiers));
  });

  it("shipped registry matches the committed defs snapshot hash", () => {
    const defsJson = JSON.parse(
      readFileSync(fileURLToPath(new URL("../src/nodes/gen/defs.json", import.meta.url)), "utf8"),
    );
    expect(defsJson.format).toBe("comfy-node-defs");
    expect(defsJson.objectInfoHash).toBe(hashObjectInfo(coreObjectInfo));
    expect(parseObjectInfo(JSON.parse(JSON.stringify(coreObjectInfo)))).toEqual(coreDefs);
  });
});
