import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * End-to-end tarball consumer test: pack the core package, install the .tgz
 * into a clean temporary project, and verify every public surface works
 * with zero monorepo-only resolution assumptions.
 *
 * Requires dist/ to exist (CI builds before testing).
 */
describe("npm tarball consumer", () => {
  it("packs, installs, imports, and compiles from a clean project", () => {
    const root = join(__dirname, "..");
    // CI now builds before tests; skip if a local run hasn't built yet.
    if (!existsSync(join(root, "dist", "index.js"))) return;

    const tmp = mkdtempSync(join(tmpdir(), "cwf-tarball-"));
    // Drive npm through the running node binary: npm/pnpm may not be on
    // PATH in test envs (GUI-launched shells on Windows), and .cmd
    // shims cannot be spawned directly. Layouts differ: Windows installer,
    // GitHub Actions toolcache, and unix prefix installs.
    const nodeDir = join(process.execPath, "..");
    const npmCliCandidates = [
      join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
      join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
      join(nodeDir, "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    ];
    const npmCli = npmCliCandidates.find((p) => existsSync(p));
    if (npmCli === undefined)
      throw new Error(`Cannot locate npm-cli.js beside ${process.execPath}`);
    const npm = (args: string[], opts: { cwd: string }): string =>
      execFileSync(process.execPath, [npmCli, ...args], { ...opts, encoding: "utf8" });
    const tgz = npm(["pack", "--pack-destination", tmp], { cwd: root });
    // `npm pack` prints a bare filename; the install below runs in a
    // different cwd, so absolutize against the pack destination.
    const tgzBase = tgz.trim().split("\n").pop()!.trim();
    const tgzPath = join(tmp, tgzBase.split(/[\\/]/).pop()!);

    const consumer = mkdtempSync(join(tmpdir(), "cwf-consumer-"));
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({ name: "cwf-consumer-test", type: "module" }),
    );
    execFileSync(process.execPath, [npmCli, "install", tgzPath], {
      cwd: consumer,
      stdio: "pipe",
    });

    const check = `
      const core = await import("@stepupgaming/comfy-workflows");
      const nodes = await import("@stepupgaming/comfy-workflows/nodes");
      const runtime = await import("@stepupgaming/comfy-workflows/runtime");
      const ir = await import("@stepupgaming/comfy-workflows/ir");
      const wfpack = await import("@stepupgaming/comfy-workflows/wfpack");
      const recipes = await import("@stepupgaming/comfy-workflows/recipes");
      if (typeof core.workflow !== "function") throw new Error("no workflow");
      if (typeof core.createClient !== "function") throw new Error("no createClient");
      if (typeof nodes.specs !== "object") throw new Error("no specs");
      if (typeof runtime.createClient !== "function") throw new Error("no runtime client");
      if (typeof ir.parseGraph !== "function") throw new Error("no parseGraph");
      if (typeof wfpack.discoverPackage !== "function") throw new Error("no discoverPackage");
      if (typeof recipes.textToImage !== "function") throw new Error("no textToImage");
      const g = recipes.textToImage({ checkpoint: "x.safetensors", positivePrompt: "hi", seed: 1 });
      const r = core.compile(g);
      if (!r.ok) throw new Error("compile failed: " + JSON.stringify(r.errors));
      console.log("CONSUMER_OK " + r.hash.slice(0, 12));
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", check], {
      cwd: consumer,
      encoding: "utf8",
    });
    expect(out).toMatch(/CONSUMER_OK [0-9a-f]{12}/);

    // Types ship with the tarball.
    expect(
      existsSync(
        join(consumer, "node_modules", "@stepupgaming", "comfy-workflows", "dist", "index.d.ts"),
      ),
    ).toBe(true);

    // Both CLI binaries work from the installed package.
    const bin = join(
      consumer,
      "node_modules",
      "@stepupgaming",
      "comfy-workflows",
      "dist",
      "cli",
      "bin.js",
    );
    const help = execFileSync(process.execPath, [bin, "--help"], {
      cwd: consumer,
      encoding: "utf8",
    });
    expect(help).toContain("cwf — code-first, typed, composable workflows for ComfyUI");
    expect(help).toContain("cwf init");
    expect(help).toContain("cwf expose");
    expect(help).toContain("cwf suggest");

    // Standalone package authoring from the installed CLI — no monorepo checkout.
    const wf = join(root, "fixtures", "workflows", "t2i.api.json");
    const pkgDir = join(consumer, "packaged-demo");
    const initOut = execFileSync(
      process.execPath,
      [bin, "init", "packaged-demo", "--from", wf, "--out", pkgDir, "--json"],
      { cwd: consumer, encoding: "utf8" },
    );
    expect(initOut).toContain('"ok": true');
    const suggestOut = execFileSync(process.execPath, [bin, "suggest", pkgDir, "--json"], {
      cwd: consumer,
      encoding: "utf8",
    });
    const suggest = JSON.parse(suggestOut.slice(suggestOut.indexOf("{")));
    expect(suggest.suggestions.some((s: { name: string }) => s.name === "checkpoint")).toBe(true);
    execFileSync(
      process.execPath,
      [
        bin,
        "expose",
        "checkpoint",
        "--node",
        "4",
        "--input",
        "ckpt_name",
        "--required",
        "--dir",
        pkgDir,
      ],
      { cwd: consumer, encoding: "utf8" },
    );
    execFileSync(
      process.execPath,
      [bin, "expose", "prompt", "--node", "6", "--input", "text", "--dir", pkgDir],
      { cwd: consumer, encoding: "utf8" },
    );
    const packOut = execFileSync(process.execPath, [bin, "pack", pkgDir, "--json"], {
      cwd: consumer,
      encoding: "utf8",
    });
    const packJson = JSON.parse(packOut.slice(packOut.indexOf("{")));
    expect(packJson.ok).toBe(true);

    const packed = execFileSync(
      process.execPath,
      [npmCli, "pack", "--pack-destination", consumer],
      {
        cwd: pkgDir,
        encoding: "utf8",
      },
    );
    const wfTgz = join(consumer, packed.trim().split("\n").pop()!.trim().split(/[\\/]/).pop()!);
    const second = mkdtempSync(join(tmpdir(), "cwf-wf-consumer-"));
    writeFileSync(
      join(second, "package.json"),
      JSON.stringify({ name: "wf-consumer", type: "module" }),
    );
    execFileSync(process.execPath, [npmCli, "install", wfTgz, tgzPath], {
      cwd: second,
      stdio: "pipe",
    });
    const inspect = execFileSync(process.execPath, [bin, "inspect", "packaged-demo", "--json"], {
      cwd: second,
      encoding: "utf8",
    });
    const inspected = JSON.parse(inspect.slice(inspect.indexOf("{")));
    expect(inspected.ok).toBe(true);
    expect(inspected.templateParams.some((p: { name: string }) => p.name === "checkpoint")).toBe(
      true,
    );
    expect(inspected.templateParams.some((p: { name: string }) => p.name === "prompt")).toBe(true);
  }, 180_000);
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
