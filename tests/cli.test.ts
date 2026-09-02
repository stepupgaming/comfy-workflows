import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

/** Spawn the CLI through jiti (dev path). Asserts on stdout JSON + exit code. */
async function comfy(args: string[]): Promise<{ stdout: string; code: number; stderr: string }> {
  const entry = join(__dirname, "..", "src", "cli", "bin.ts");
  try {
    const { stdout, stderr } = await run("node", ["--import", "jiti/register", entry, ...args], {
      cwd: __dirname,
    });
    return { stdout, code: 0, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? "", code: err.code ?? 1, stderr: err.stderr ?? "" };
  }
}

const jsonOf = <T>(stdout: string): T => {
  const start = stdout.indexOf("{");
  return JSON.parse(stdout.slice(start)) as T;
};

describe("CLI", () => {
  it("catalog finds nodes by substring", async () => {
    const { stdout, code } = await comfy(["catalog", "sampler"]);
    expect(code).toBe(0);
    expect(stdout).toContain("KSampler");
  });

  it("import converts editor workflow → IR, then explain prints the expansion", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const irPath = join(dir, "t2i.ir.json");
    const imp = await comfy([
      "import",
      join(__dirname, "..", "fixtures", "workflows", "t2i.ui.json"),
      "--out",
      irPath,
    ]);
    expect(imp.code).toBe(0);
    const summary = jsonOf<{ ok: boolean; nodes: number; diagnostics: unknown[] }>(imp.stdout);
    expect(summary.ok).toBe(true);
    expect(summary.diagnostics).toEqual([]);

    const exp = await comfy(["explain", irPath]);
    expect(exp.code).toBe(0);
    expect(exp.stdout).toContain("LoraLoader [bypassed]");
    expect(exp.stdout).toContain("seed=987654321");
  });

  it("import --ts emits a workflow.ts that compiles back to the same graph", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const tsPath = join(dir, "workflow.ts");
    const imp = await comfy([
      "import",
      join(__dirname, "..", "fixtures", "workflows", "t2i.api.json"),
      "--ts",
      tsPath,
      "--out",
      join(dir, "t2i.ir.json"),
    ]);
    expect(imp.code).toBe(0);
    const cmp = await comfy(["compile", tsPath]);
    expect(cmp.code).toBe(0);
    const wire = JSON.parse(cmp.stdout) as Record<string, unknown>;
    expect(Object.keys(wire).length).toBe(7);
  }, 30_000);

  it("compile reports machine-readable validation errors and exit code 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const bad = join(dir, "bad.ir.json");
    await (
      await import("node:fs/promises")
    ).writeFile(
      bad,
      JSON.stringify({
        irVersion: 1,
        nodes: { n1: { type: "KSampler", params: { seed: { $int: "42" } }, inputs: {} } },
        outputs: [],
      }),
    );
    const res = await comfy(["compile", bad]);
    expect(res.code).toBe(1);
    const body = jsonOf<{ ok: boolean; errors: Array<{ code: string }> }>(res.stderr);
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.code === "E_MISSING_INPUT")).toBe(true);
  });

  it("import is lossless: giant seeds survive the CLI round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const apiPath = join(dir, "giant.api.json");
    const irPath = join(dir, "giant.ir.json");
    // Raw string on purpose: the whole point is that the file contains the
    // exact 2^64−1 literal, which a JS number could not represent.
    const rawApi = `{"n1":{"class_type":"KSampler","inputs":{"seed":18446744073709551615,"cfg":8},"_meta":{"title":"KSampler"}}}`;
    await (await import("node:fs/promises")).writeFile(apiPath, rawApi);
    const res = await comfy(["import", apiPath, "--out", irPath]);
    expect(res.code).toBe(0);
    // Plain JSON.parse would have corrupted the seed before import ever ran;
    // the IR must carry the exact value as a tagged integer.
    const { readFileSync } = await import("node:fs");
    const irText = readFileSync(irPath, "utf8");
    expect(irText).toContain('"$int":"18446744073709551615"');
    const { parseGraph } = await import("../src/ir/serialize.js");
    const graph = parseGraph(irText);
    expect(graph.nodes["n1"].params["seed"]).toBe(18446744073709551615n);
  });

  it("-o short flag writes output files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const outPath = join(dir, "out.api.json");
    const res = await comfy([
      "compile",
      join(__dirname, "..", "fixtures", "workflows", "t2i.api.json"),
      "-o",
      outPath,
    ]);
    expect(res.code).toBe(0);
    const { existsSync } = await import("node:fs");
    expect(existsSync(outPath)).toBe(true);
    const wire = JSON.parse((await import("node:fs")).readFileSync(outPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(wire).length).toBe(7);
  });

  it("lock drift is reported as a warning when the node universe changed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const lockPath = join(dir, "comfy.lock.json");
    // Lock claiming a different universe than the bundled defs:
    await (
      await import("node:fs/promises")
    ).writeFile(
      lockPath,
      JSON.stringify({
        format: "comfy-lock",
        version: 1,
        capturedAt: "2020-01-01T00:00:00.000Z",
        comfyuiVersion: "0.0.1-test",
        objectInfoHash: "deadbeef".repeat(8),
        nodePacks: {},
      }),
    );
    const irPath = join(dir, "wf.ir.json");
    await (
      await import("node:fs/promises")
    ).writeFile(
      irPath,
      JSON.stringify({
        irVersion: 1,
        nodes: {
          n1: {
            type: "EmptyLatentImage",
            params: { width: 64, height: 64, batch_size: 1 },
            inputs: {},
          },
        },
        outputs: [],
      }),
    );
    const res = await comfy(["compile", irPath, "--lock", lockPath, "-o", join(dir, "out.json")]);
    expect(res.code).toBe(0); // drift is a warning, not a failure
    expect(res.stderr).toContain("E_LOCK_DRIFT");
    expect(res.stderr).toContain("Environment drift");
  });

  it("--param binds template params, including bigint seeds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
    const irPath = join(dir, "tpl.ir.json");
    await (
      await import("node:fs/promises")
    ).writeFile(
      irPath,
      JSON.stringify({
        irVersion: 1,
        params: { seed: { name: "seed", type: "int" } },
        nodes: {
          n1: { type: "TestNode", raw: 1, params: { seed: { $param: "seed" } }, inputs: {} },
        },
        outputs: [],
      }),
    );
    const res = await comfy(["compile", irPath, "--param", "seed=18446744073709551615"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"seed":18446744073709551615');
  });
});
