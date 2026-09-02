import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Live-server integration tests stay skipped unless COMFY_URL points at a
    // running ComfyUI instance.
    testTimeout: 20_000,
  },
});
