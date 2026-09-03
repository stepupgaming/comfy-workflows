import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile/index.js";
import { ComfyError } from "../src/errors.js";
import { parseGraph, serializeGraph } from "../src/ir/serialize.js";
import { instantiateTemplate } from "../src/ir/template.js";
import { hiresFix } from "../src/recipes/compose.js";
import { textToImage } from "../src/recipes/textToImage.js";
import {
  checkPackageCoherence,
  deriveNodeClasses,
  discoverPackage,
  graphFromPackageValue,
  loadPackageGraph,
  parseWorkflowManifest,
} from "../src/wfpack/index.js";
import { coreDefs } from "./helpers.js";

const BASE_MANIFEST = {
  specVersion: 1,
  name: "text-to-image",
  title: "Text to Image",
  entry: "./workflow.ir.json",
  parameters: {
    checkpoint: { type: "string", required: true },
    prompt: { type: "string", required: true },
    seed: { type: "integer", required: true },
  },
  outputs: [{ name: "image", type: "IMAGE" }],
  requires: {
    nodeClasses: [
      "CheckpointLoaderSimple",
      "CLIPTextEncode",
      "EmptyLatentImage",
      "KSampler",
      "SaveImage",
      "VAEDecode",
    ],
    nodePacks: [],
    models: [],
  },
};

/** Minimal concrete (non-template) IR with one node. */
function tinyIr() {
  return {
    irVersion: 1,
    nodes: {
      n1: {
        type: "EmptyLatentImage",
        params: { width: 64, height: 64, batch_size: 1 },
        inputs: {},
      },
    },
    outputs: [],
  };
}

/** Write an npm-style package dir; returns the dir. */
function writePkg(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "cwf-pkg-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(dir, rel.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function validPkgDir(opts: { evilJs?: boolean } = {}): string {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "test-pkg",
      version: "0.1.0",
      keywords: ["comfy-workflow", "comfyui", "comfy-workflows"],
      comfyWorkflow: "./comfy.workflow.json",
    }),
    "comfy.workflow.json": JSON.stringify(BASE_MANIFEST),
    "workflow.ir.json": JSON.stringify(tinyIr()),
    "index.js":
      opts.evilJs === true ? `throw new Error("executed!");` : `export const hello = () => "hi";`,
  };
  return writePkg(files);
}

describe("manifest", () => {
  it("accepts a valid manifest", () => {
    const m = parseWorkflowManifest(BASE_MANIFEST);
    expect(m.name).toBe("text-to-image");
    expect(m.requires.nodeClasses).toHaveLength(6);
  });

  it("normalizes integer → int", () => {
    const m = parseWorkflowManifest(BASE_MANIFEST);
    expect(m.parameters["seed"].type).toBe("int");
  });

  it("rejects bad specVersion", () => {
    expect(() => parseWorkflowManifest({ ...BASE_MANIFEST, specVersion: 2 })).toThrow(ComfyError);
  });

  it("rejects missing name / absolute entry", () => {
    expect(() => parseWorkflowManifest({ ...BASE_MANIFEST, name: "" })).toThrow(/"name"/);
    expect(() => parseWorkflowManifest({ ...BASE_MANIFEST, entry: "/abs/path.json" })).toThrow(
      /relative/,
    );
  });

  it("rejects non-boolean required", () => {
    const bad = JSON.parse(JSON.stringify(BASE_MANIFEST));
    bad.parameters["prompt"] = { type: "string" };
    expect(() => parseWorkflowManifest(bad)).toThrow(/required/);
  });
});

describe("discovery", () => {
  it("discovers a package by directory without executing its JS", () => {
    const dir = validPkgDir({ evilJs: true });
    const pkg = discoverPackage(dir);
    expect(pkg.manifest.name).toBe("text-to-image");
    expect(pkg.irPath.endsWith("workflow.ir.json")).toBe(true);
    // If index.js had run, this test process would have thrown.
  });

  it("loads the IR entry as data", () => {
    const pkg = discoverPackage(validPkgDir());
    const graph = loadPackageGraph(pkg);
    expect(deriveNodeClasses(graph)).toEqual(["EmptyLatentImage"]);
  });

  it("errors on missing entry", () => {
    const dir = writePkg({
      "package.json": JSON.stringify({ name: "x", comfyWorkflow: "./comfy.workflow.json" }),
      "comfy.workflow.json": JSON.stringify({ ...BASE_MANIFEST, entry: "./missing.json" }),
    });
    expect(() => discoverPackage(dir)).toThrow(/not found/);
  });

  it("errors when no manifest pointer exists", () => {
    const dir = writePkg({ "package.json": JSON.stringify({ name: "x" }) });
    expect(() => discoverPackage(dir)).toThrow(/comfyWorkflow/);
  });

  it("rejects entries escaping the package", () => {
    const dir = writePkg({
      "package.json": JSON.stringify({ name: "x", comfyWorkflow: "./comfy.workflow.json" }),
      "comfy.workflow.json": JSON.stringify({ ...BASE_MANIFEST, entry: "../escape.json" }),
    });
    expect(() => discoverPackage(dir)).toThrow(/escapes/);
  });
});

describe("coherence", () => {
  it("a template package with matching manifest is coherent", () => {
    const graph = textToImage({
      checkpoint: { $param: "checkpoint" },
      positivePrompt: { $param: "prompt" },
      seed: { $param: "seed" },
    });
    const manifest = parseWorkflowManifest(BASE_MANIFEST);
    const report = checkPackageCoherence(manifest, graph);
    expect(report.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("flags undeclared IR params and stale node classes", () => {
    const graph = textToImage({
      checkpoint: { $param: "checkpoint" },
      positivePrompt: { $param: "prompt" },
      seed: { $param: "seed" },
    });
    const manifest = parseWorkflowManifest({
      ...BASE_MANIFEST,
      parameters: { checkpoint: { type: "string", required: true } },
      requires: {
        nodeClasses: ["CheckpointLoaderSimple", "NoSuchNode"],
        nodePacks: [],
        models: [],
      },
    });
    const report = checkPackageCoherence(manifest, graph);
    expect(report.ok).toBe(false);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("E_PACK_MISSING_PARAM");
    expect(codes).toContain("E_PACK_NODE_CLASSES_MISSING");
    expect(codes).toContain("E_PACK_NODE_CLASSES_STALE");
  });
});

describe("first-party packages", () => {
  for (const dir of ["packages/workflow-t2i", "packages/workflow-hires"]) {
    it(`${dir} passes pack coherence`, async () => {
      const { default: path } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
      const pkg = discoverPackage(path.join(root, dir));
      const graph = loadPackageGraph(pkg);
      const report = checkPackageCoherence(pkg.manifest, graph);
      const errors = report.diagnostics.filter((d) => d.level === "error");
      expect(errors).toEqual([]);
      // Manifest nodeClasses equal the derived set (by construction).
      expect(pkg.manifest.requires.nodeClasses).toEqual(deriveNodeClasses(graph));
    });
  }

  it("t2i template instantiates and compiles deterministically", async () => {
    const { default: path } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const pkg = discoverPackage(path.join(root, "packages/workflow-t2i"));
    const tpl = loadPackageGraph(pkg);
    const bound = instantiateTemplate(tpl, {
      params: {
        checkpoint: "v1-5-pruned-emaonly.safetensors",
        prompt: "a lighthouse",
        seed: 7,
      } as never,
    });
    const a = compile(bound, coreDefs);
    const b = compile(bound, coreDefs);
    if (!a.ok || !b.ok) throw new Error("t2i package failed to compile");
    expect(a.json).toBe(b.json);
  });

  it("composability: packaged template + hiresFix → one valid IR → deterministic compile", async () => {
    const { default: path } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const pkg = discoverPackage(path.join(root, "packages/workflow-t2i"));
    // Template-level composition: placeholders survive the transform.
    const composed = hiresFix(loadPackageGraph(pkg), { denoise: 0.5, scaleBy: 1.5 });
    expect(deriveNodeClasses(composed)).toContain("KSamplerAdvanced");
    const bound = instantiateTemplate(composed, {
      params: {
        checkpoint: "v1-5-pruned-emaonly.safetensors",
        prompt: "a lighthouse",
        seed: 7,
      } as never,
    });
    const a = compile(bound, coreDefs);
    if (!a.ok)
      throw new Error(`composed compile failed: ${a.errors.map((e) => e.message).join("; ")}`);
    const again = compile(bound, coreDefs);
    if (!again.ok) throw new Error("recompile failed");
    expect(a.json).toBe(again.json);
  });

  it("packaged IR round-trips losslessly (bigint seeds survive)", () => {
    const tpl = textToImage({
      checkpoint: "x.safetensors",
      positivePrompt: "p",
      seed: 18446744073709551615n,
    });
    // The real file round-trip: serializeGraph tags bigints as $int,
    // parseGraph revives them. Plain JSON.parse alone cannot do this —
    // that is why loading always goes through parseGraph.
    const revived = parseGraph(serializeGraph(tpl));
    expect(revived.nodes["n5"].params["seed"]).toBe(18446744073709551615n);
  });
});
