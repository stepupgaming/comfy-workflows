import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClient } from "../src/runtime/client.js";
import { importComfyJson } from "../src/import/index.js";
import { parseObjectInfo } from "../src/defs/parse.js";
import { instantiateTemplate } from "../src/ir/template.js";
import { workflow } from "../src/builder/builder.js";
import { specs as generated } from "../src/nodes/gen/registry.js";

/**
 * Live integration suite — OPT-IN, runs only when COMFY_URL points at a real
 * ComfyUI instance. Exercises the full pipeline against the live node
 * universe: /object_info, import/compile with live defs, /prompt submission,
 * WS/history completion, artifact retrieval.
 *
 * Fully generic: the execution workflow is chosen from whatever nodes the
 * live instance actually exposes. If the instance has a checkpoint, the
 * richer text→image path runs (proving the lossless >2^53 seed live); if it
 * has none (e.g. a fresh CPU-only install), the model-free EmptyImage →
 * SaveImage path still exercises submission, completion, and artifacts.
 */

const COMFY_URL = process.env["COMFY_URL"];
const d = COMFY_URL !== undefined ? describe : describe.skip;

type RawInfo = Record<string, { input?: { required?: Record<string, unknown> } }>;

/** First combo option of an input, straight from the live /object_info map. */
function firstCombo(liveInfo: RawInfo, classType: string, input: string): string | undefined {
  const spec = liveInfo[classType]?.input?.required?.[input] as unknown;
  if (Array.isArray(spec) && Array.isArray(spec[0])) {
    const options = spec[0] as unknown[];
    return typeof options[0] === "string" ? options[0] : undefined;
  }
  return undefined;
}

d("live integration (COMFY_URL)", () => {
  const client = createClient({
    url: COMFY_URL ?? "http://127.0.0.1:8188", // unreachable when skipped; lazy use only
    timeoutMs: Number(process.env["COMFY_TIMEOUT_MS"] ?? 300_000),
  });

  it("fetches /object_info and the defs parse into a usable registry", async () => {
    const info = await client.objectInfo();
    const classes = Object.keys(info);
    expect(classes.length).toBeGreaterThan(10);
    // Core nodes the suite's execution paths rely on.
    for (const required of ["SaveImage", "LoadImage"]) {
      expect(classes, `live instance lacks ${required}`).toContain(required);
    }
    const defs = parseObjectInfo(info as never);
    expect(Object.keys(defs).length).toBe(classes.length);
  });

  it("imports and compiles with LIVE defs, then validates against that universe", async () => {
    const liveDefs = parseObjectInfo((await client.objectInfo()) as never);
    const liveInfo = (await client.objectInfo()) as RawInfo;
    const ckptOptions =
      (liveInfo["CheckpointLoaderSimple"]?.input?.required?.["ckpt_name"] as [string[]] | undefined)?.[0] ?? [];

    const workflowJson =
      ckptOptions.length > 0
        ? {
            "1": {
              class_type: "CheckpointLoaderSimple",
              inputs: { ckpt_name: ckptOptions[0] },
              _meta: { title: "Load Checkpoint" },
            },
            "2": {
              class_type: "CLIPTextEncode",
              inputs: { text: "a dot", clip: ["1", 1] },
              _meta: { title: "pos" },
            },
            "3": {
              class_type: "CLIPTextEncode",
              inputs: { text: "", clip: ["1", 1] },
              _meta: { title: "neg" },
            },
            "4": {
              class_type: "EmptyLatentImage",
              inputs: { width: 64, height: 64, batch_size: 1 },
              _meta: { title: "latent" },
            },
            "5": {
              class_type: "KSampler",
              inputs: {
                seed: 42,
                steps: 2,
                cfg: 1,
                sampler_name: "euler",
                scheduler: "normal",
                denoise: 1,
                model: ["1", 0],
                positive: ["2", 0],
                negative: ["3", 0],
                latent_image: ["4", 0],
              },
              _meta: { title: "KSampler" },
            },
            "6": {
              class_type: "VAEDecode",
              inputs: { samples: ["5", 0], vae: ["1", 2] },
              _meta: { title: "decode" },
            },
            "7": {
              class_type: "SaveImage",
              inputs: { images: ["6", 0], filename_prefix: "comfy-sdk-live" },
              _meta: { title: "save" },
            },
          }
        : {
            // Model-free fallback chosen from the live universe.
            "1": {
              class_type: "EmptyImage",
              inputs: { width: 64, height: 64, batch_size: 1, color: 0 },
              _meta: { title: "img" },
            },
            "2": {
              class_type: "SaveImage",
              inputs: { images: ["1", 0], filename_prefix: "comfy-sdk-live" },
              _meta: { title: "save" },
            },
          };

    const imported = importComfyJson(workflowJson, liveDefs);
    expect(imported.diagnostics).toEqual([]);

    const validation = await client.validate({ kind: "graph", graph: imported.graph }, liveDefs);
    expect(validation.ok, JSON.stringify({ errors: validation.errors, server: validation.serverResponse })).toBe(
      true,
    );
  });

  it("submits via /prompt, completes over WS/history, and retrieves artifacts", async () => {
    const liveInfo = (await client.objectInfo()) as RawInfo;
    const liveDefs = parseObjectInfo(liveInfo as never);
    const ckptOptions =
      (liveInfo["CheckpointLoaderSimple"]?.input?.required?.["ckpt_name"] as [string[]] | undefined)?.[0] ?? [];

    const outDir = mkdtempSync(join(tmpdir(), "comfy-live-"));
    const events: string[] = [];
    let graph;

    if (ckptOptions.length > 0) {
      // Richer path: author with the SDK's generated registry and prove the
      // lossless >2^53 seed reaches the live server byte-exact.
      const g = workflow("live-t2i");
      const ckpt = g.add(generated.CheckpointLoaderSimple, { ckpt_name: ckptOptions[0] });
      const pos = g.add(generated.CLIPTextEncode, { text: "a single red dot on white", clip: ckpt.CLIP });
      const neg = g.add(generated.CLIPTextEncode, { text: "", clip: ckpt.CLIP });
      const lat = g.add(generated.EmptyLatentImage, { width: 64, height: 64, batch_size: 1 });
      const ks = g.add(generated.KSampler, {
        model: ckpt.MODEL,
        positive: pos.CONDITIONING,
        negative: neg.CONDITIONING,
        latent_image: lat.LATENT,
        seed: 18446744073709551615n, // > 2^53 — proves the lossless wire path live
        steps: 2,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
      });
      const dec = g.add(generated.VAEDecode, { samples: ks.LATENT, vae: ckpt.VAE });
      g.add(generated.SaveImage, { images: dec.IMAGE, filename_prefix: "comfy-sdk-live" });
      graph = g.toGraph();
    } else {
      // Model-free path for instances without checkpoints (fresh/CPU installs).
      const g = workflow("live-image");
      const img = g.rawNode(
        "EmptyImage",
        { width: 64, height: 64, batch_size: 1, color: 16711680 },
        { outputs: [{ name: "IMAGE", type: "IMAGE" }] },
      );
      const save = g.rawNode("SaveImage", { filename_prefix: "comfy-sdk-live" });
      g.connectInput(save.id, "images", img.slots[0]);
      g.output(save.out(0) === undefined ? img.slots[0] : img.slots[0]);
      graph = g.toGraph();
    }

    const result = await client.run(
      { kind: "graph", graph },
      {
        outDir,
        defs: liveDefs,
        onEvent: (e) => events.push(e.type),
      },
    );
    expect(result.runId).toBeTypeOf("string");
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts[0].savedPath).toBeDefined();
    expect(existsSync(result.artifacts[0].savedPath as string)).toBe(true);
    expect(events).toContain("submitted");
    expect(events).toContain("executing");
    // Replay metadata exists and carries the exact wire body.
    const runJson = JSON.parse(readFileSync(join(outDir, result.runId, "run.json"), "utf8")) as {
      compiledJson: string;
      graphHash?: string;
    };
    expect(runJson.compiledJson).toBeTypeOf("string");
    if (ckptOptions.length > 0) {
      expect(runJson.compiledJson).toContain('"seed":18446744073709551615');
    }
  }, 240_000);
});
