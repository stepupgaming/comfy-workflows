import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fast packaging assertions. The heavyweight clean-tarball consumer lives in
 * `scripts/test-packed-consumer.mjs` and is run by CI / release.yml after tests.
 */
describe("packaging artifacts", () => {
describe("packed CLI shims", () => {
  it("declares both cwf and comfy-workflows bins", () => {
    const root = join(__dirname, "..");
    const pj = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    expect(pj.bin["cwf"]).toBe("dist/cli/bin.js");
    expect(pj.bin["comfy-workflows"]).toBe("dist/cli/bin.js");
  });
});
});

describe("no stale comfy-sdk imports", () => {
  it("source, examples, packages, and tests use the new specifiers", () => {
    const roots = ["src", "examples", "packages", "tests", "scripts"].map((d) =>
      join(__dirname, "..", d),
    );
    // src/cli/cli.ts keeps a documented compatibility alias map so
    // workflow.ts files authored before the rename still compile.
    const exempt = new Set([join(__dirname, "..", "src", "cli", "cli.ts")]);
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "gen" || entry === "node_modules" || entry === "dist") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|mjs|mts)$/.test(entry)) continue;
        if (exempt.has(full)) continue;
        const text = readFileSync(full, "utf8");
        // Stale signal is an actual import specifier, not prose mentioning
        // the old name (migration notes, this test's own description).
        if (/from ["']comfy-sdk/.test(text)) bad.push(full);
      }
    };
    for (const r of roots) if (existsSync(r)) walk(r);
    expect(bad).toEqual([]);
  });
});
