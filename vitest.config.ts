import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Forks isolate long npm-pack consumer tests from the thread-pool RPC
    // timeout that otherwise fires after a 2-minute execFileSync.
    pool: "forks",
    // Live-server integration tests stay skipped unless COMFY_URL points at a
    // running ComfyUI instance.
    testTimeout: 20_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
  },
});
