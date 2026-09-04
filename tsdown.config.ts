import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/nodes/index.ts",
    "src/runtime/index.ts",
    "src/ir/index.ts",
    "src/wfpack/index.ts",
    "src/deps/index.ts",
    "src/recipes/index.ts",
    "src/cli/bin.ts",
  ],
  dts: true,
  platform: "node",
  target: "node22",
  format: "esm",
});
