/**
 * Build first-party workflow packages: for each package in packages/,
 * jiti-load its ir.build.ts, serialize the template graph to
 * workflow.ir.json, and write comfy.workflow.json with parameters +
 * nodeClasses derived from the IR (coherence by construction).
 *
 * Usage: jiti scripts/build-workflow-packages.mjs [--check]
 * --check verifies committed artifacts are up to date (CI drift gate).
 */
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PACKAGES = ["packages/workflow-t2i", "packages/workflow-hires"];
const check = process.argv.includes("--check");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@stepupgaming/comfy-workflows": path.join(ROOT, "src", "index.ts"),
    "@stepupgaming/comfy-workflows/nodes": path.join(ROOT, "src", "nodes", "index.ts"),
    "@stepupgaming/comfy-workflows/runtime": path.join(ROOT, "src", "runtime", "index.ts"),
    "@stepupgaming/comfy-workflows/ir": path.join(ROOT, "src", "ir", "index.ts"),
    "@stepupgaming/comfy-workflows/wfpack": path.join(ROOT, "src", "wfpack", "index.ts"),
    "@stepupgaming/comfy-workflows/recipes": path.join(ROOT, "src", "recipes", "index.ts"),
  },
});

const core = await jiti.import(path.join(ROOT, "src", "index.ts"));

let dirty = false;
for (const dir of PACKAGES) {
  const built = await jiti.import(path.join(ROOT, dir, "ir.build.ts"));
  const graph = built.buildTemplate();
  const ir = core.serializeGraph(graph, { pretty: true }) + "\n";

  const params = {};
  for (const p of core.templateParams(graph)) {
    const def = graph.params[p.name];
    params[p.name] = {
      type: def.type === "combo" ? "string" : def.type,
      required: p.required,
      ...(def.default !== undefined && typeof def.default !== "object"
        ? { default: def.default }
        : {}),
      ...(def.options !== undefined ? { options: def.options } : {}),
      ...(def.description !== undefined ? { description: def.description } : {}),
    };
  }
  // Manifest outputs are declared by the package author; `cwf pack`
  // verifies they match the graph's output decls.
  const outputs = built.manifestMeta.outputs;
  const manifest = {
    specVersion: 1,
    name: built.manifestMeta.name,
    title: built.manifestMeta.title,
    entry: "./workflow.ir.json",
    description: built.manifestMeta.description,
    parameters: params,
    outputs,
    requires: {
      nodeClasses: core.deriveNodeClasses(graph),
      nodePacks: [],
      models: built.manifestMeta.models,
    },
    coreVersion: core.corePeerRange(
      JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
    ),
    compatibility: built.manifestMeta.compatibility,
  };

  const irText = ir;
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  if (check) {
    const cur1 = readFileSync(`${dir}/workflow.ir.json`, "utf8");
    const cur2 = readFileSync(`${dir}/comfy.workflow.json`, "utf8");
    if (cur1 !== irText || cur2 !== manifestText) {
      console.error(`${dir}: artifacts differ — run pnpm build:packages`);
      dirty = true;
    }
  } else {
    writeFileSync(`${dir}/workflow.ir.json`, irText);
    writeFileSync(`${dir}/comfy.workflow.json`, manifestText);
    console.log(`${dir}: wrote workflow.ir.json + comfy.workflow.json`);
  }
}
if (dirty) process.exit(1);
