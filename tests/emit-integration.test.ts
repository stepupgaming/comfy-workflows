import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createJiti } from "jiti";
import { generateNodeModules } from "../src/codegen/codegen.js";
import { parseObjectInfo } from "../src/defs/parse.js";
import { importComfyJson } from "../src/import/index.js";
import { emitTs } from "../src/emit-ts/emit.js";
import { compile } from "../src/compile/index.js";
import type { NodeDefs } from "../src/defs/index.js";
import { coreObjectInfo, coreDefs } from "./helpers.js";

/**
 * Synthetic custom node "ComfySDKTestEcho" — NOT in the shipped core registry.
 * Proves the generic chain: defs → codegen → import → emit workflow.ts →
 * that file loads and compiles. No node-pack special cases anywhere.
 */

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
        optional: {},
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

describe("custom-node codegen → import → emit → compile (synthetic, not in shipped registry)", () => {
  it("custom class is absent from the shipped registry and present in live-style defs", () => {
    expect((coreDefs as NodeDefs)[CUSTOM_CLASS]).toBeUndefined();
    const defs = parseObjectInfo(liveStyleObjectInfo() as never);
    expect(defs[CUSTOM_CLASS]).toBeDefined();
  });

  it("generates specs for the custom class with an explicit module contract", () => {
    const defs = parseObjectInfo(liveStyleObjectInfo() as never);
    const out = generateNodeModules({ defs, objectInfoHash: "test", importsFrom: "comfy-sdk" });
    const registryFile = out.files.find((f) => f.path === "registry.ts");
    expect(registryFile?.content).toContain(`from "comfy-sdk"`);
    const categoryFile = out.files.find((f) => f.path === "comfy_sdk_test.ts");
    expect(categoryFile?.content).toContain(`export const ${CUSTOM_CLASS}`);
    expect(categoryFile?.content).toContain(`from "comfy-sdk"`);
  });

  it("end-to-end: import → emit → emitted workflow.ts loads and compiles", async () => {
    const defs = parseObjectInfo(liveStyleObjectInfo() as never);
    const outDir = mkdtempSync(join(tmpdir(), "comfy-emit-"));

    // 1. Generate custom-node specs into a package-style directory.
    const genDir = join(outDir, "comfy-nodes");
    const generated = generateNodeModules({
      defs,
      objectInfoHash: "test",
      importsFrom: "comfy-sdk",
    });
    mkdirSync(genDir, { recursive: true });
    for (const f of generated.files) writeFileSync(join(genDir, f.path), f.content);

    // 2. Import a workflow using the custom node (defs-known, registry-unknown).
    const workflowJson = {
      "1": { class_type: "LoadImage", inputs: { image: "in.png" }, _meta: { title: "img" } },
      "2": {
        class_type: CUSTOM_CLASS,
        inputs: { image: ["1", 0], strength: 0.5, mode: "echo" },
        _meta: { title: "echo" },
      },
      "3": {
        class_type: "SaveImage",
        inputs: { images: ["2", 0], filename_prefix: "echo" },
        _meta: { title: "save" },
      },
    };
    const { graph } = importComfyJson(workflowJson, defs);
    // Import marks registry-unknown classes raw; that's fine — emit decides.

    // 3. Emit workflow.ts routed through the generated registry.
    const registryClasses = new Set(Object.keys(defs));
    const identifiers = new Map<string, string>(Object.entries(generated.identifiers));
    const ts = emitTs(graph, {
      defs,
      registries: [
        { specifier: "./comfy-nodes/registry.js", classes: registryClasses, identifiers },
      ],
    });
    const tsPath = join(outDir, "workflow.ts");
    writeFileSync(tsPath, ts);

    // 4. The emitted file must reference the custom node via the generated
    //    registry (not comfy-sdk/nodes, which lacks it) and must LOAD.
    expect(ts).toContain(`from "./comfy-nodes/registry.js"`);
    expect(ts).not.toContain(`${CUSTOM_CLASS} = g.rawNode`);

    // jiti-load the emitted file with the same alias map the CLI uses.
    const jiti = createJiti(import.meta.url, {
      alias: {
        "comfy-sdk/nodes": new URL("../src/nodes/index.ts", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
        "comfy-sdk": new URL("../src/index.ts", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
        "./comfy-nodes/registry.js": join(genDir, "registry.ts"),
      },
    });
    const mod = (await jiti.import(tsPath)) as { build: () => unknown };
    const rebuilt = mod.build() as Parameters<typeof compile>[0];

    // 5. The rebuilt graph compiles — with the custom node typed, not raw.
    expect(rebuilt.nodes["2"]?.raw).toBeUndefined();
    const result = compile(rebuilt, defs);
    if (!result.ok) {
      throw new Error(`compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
    }
    expect(result.json).toContain(`"${CUSTOM_CLASS}"`);
  }, 30_000);

  it("emitted TS for registry-unknown custom nodes falls back to rawNode and still compiles", async () => {
    const defs = parseObjectInfo(liveStyleObjectInfo() as never);
    const outDir = mkdtempSync(join(tmpdir(), "comfy-emit-"));
    const workflowJson = {
      "1": { class_type: "LoadImage", inputs: { image: "in.png" }, _meta: { title: "img" } },
      "2": {
        class_type: CUSTOM_CLASS,
        inputs: { image: ["1", 0], strength: 0.5, mode: "echo" },
        _meta: { title: "echo" },
      },
      "3": {
        class_type: "SaveImage",
        inputs: { images: ["2", 0], filename_prefix: "echo" },
        _meta: { title: "save" },
      },
    };
    const { graph } = importComfyJson(workflowJson, defs);
    // NO registries passed: custom class is unknown to every registry.
    const ts = emitTs(graph, { defs });
    expect(ts).toContain('g.rawNode("ComfySDKTestEcho"');
    expect(ts).not.toContain(`import { ComfySDKTestEcho }`);

    // The emitted file loads (via CLI compile path) and compiles.
    const tsPath = join(outDir, "workflow.ts");
    writeFileSync(tsPath, ts);
    const cliEntry = new URL("../src/cli/cli.ts", import.meta.url).pathname.replace(
      /^\/([A-Z]:)/,
      "$1",
    );
    const jitiCli = createJiti(import.meta.url, {
      alias: {
        "comfy-sdk/nodes": new URL("../src/nodes/index.ts", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
        "comfy-sdk": new URL("../src/index.ts", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
      },
    });
    const cliMod = (await jitiCli.import(cliEntry)) as { cli: (argv: string[]) => Promise<number> };
    const exitCode = await cliMod.cli(["compile", tsPath, "-o", join(outDir, "out.json")]);
    expect(exitCode).toBe(0);
    expect(readFileSync(join(outDir, "out.json"), "utf8")).toContain(`"${CUSTOM_CLASS}"`);
    expect(existsSync(join(outDir, "out.json"))).toBe(true);
  }, 30_000);
});
