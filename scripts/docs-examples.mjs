#!/usr/bin/env node
/**
 * Execute the checked-in docs examples against the local TypeScript sources.
 */
import { createJiti } from "jiti";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@stepupgaming/comfy-workflows": join(src, "index.ts"),
    "@stepupgaming/comfy-workflows/nodes": join(src, "nodes/index.ts"),
    "@stepupgaming/comfy-workflows/recipes": join(src, "recipes/index.ts"),
    "@stepupgaming/comfy-workflows/runtime": join(src, "runtime/index.ts"),
    "@stepupgaming/comfy-workflows/ir": join(src, "ir/index.ts"),
  },
});

const { compile } = await jiti.import(join(root, "src/compile/index.ts"));
const { bindParams } = await import(pathToFileURL(join(root, "docs/examples-src/binder.js")).href);

const codeFirst = await jiti.import(join(root, "docs/examples-src/code-first.ts"));
const template = await jiti.import(join(root, "docs/examples-src/template.ts"));
const recipes = await jiti.import(join(root, "docs/examples-src/recipes.ts"));
const product = await jiti.import(join(root, "docs/examples-src/product-build.ts"));
const typed = await jiti.import(join(root, "docs/examples-src/typed-nodes.ts"));
const escape = await jiti.import(join(root, "docs/examples-src/escape.ts"));

function mustCompile(label, graph) {
  const result = compile(graph);
  if (!result.ok) {
    const msg = result.errors.map((e) => `${e.code}: ${e.message}`).join("\n");
    throw new Error(`${label} failed to compile:\n${msg}`);
  }
  return result;
}

mustCompile("code-first", codeFirst.build());
mustCompile(
  "template",
  template.bind({
    checkpoint: "v1-5-pruned-emaonly.safetensors",
    prompt: "a red cube",
    seed: 42n,
  }),
);
mustCompile("recipes", recipes.bound());
mustCompile("typed-nodes", typed.usesNamedSpecs());
mustCompile("escape rawNode", escape.unknownClassGraph());

const ir = product.emitArtifacts().ir;
if (!ir.includes("$param")) {
  throw new Error("product-build IR is missing {$param} placeholders");
}

const bound = bindParams(
  { inputs: { seed: { $param: "seed" }, text: { $param: "prompt" } } },
  { seed: 42, prompt: "hi" },
);
if (bound.inputs.seed !== 42 || bound.inputs.text !== "hi") {
  throw new Error("binder did not replace {$param} values");
}

process.stdout.write("docs-examples: compile + binder ok\n");
