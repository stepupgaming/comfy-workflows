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

  it("validate/run auto-fetch live defs from --url without --defs", async () => {
    const { createServer } = await import("node:http");
    let promptCount = 0;
    let objectInfoCount = 0;
    const liveObjectInfo = {
      // NOT in the bundled core registry — only live defs can compile this.
      LiveOnlyNode: {
        input: { required: { value: ["INT", { default: 1, min: 0 }] } },
        input_order: { required: ["value"] },
        output: ["IMAGE"],
        output_name: ["IMAGE"],
        name: "Live Only",
        category: "test",
        output_node: false,
      },
    };
    const server = createServer((req, res) => {
      const url = req.url ?? "";
      if (url.endsWith("/object_info")) {
        objectInfoCount++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(liveObjectInfo));
        return;
      }
      if (url.endsWith("/prompt")) {
        promptCount++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ prompt_id: "mock-live-run", number: 1 }));
        return;
      }
      if (url.includes("/history/")) {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            "mock-live-run": { status: { status_str: "success", completed: true }, outputs: {} },
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;

    try {
      const dir = mkdtempSync(join(tmpdir(), "comfy-cli-"));
      const irPath = join(dir, "live.ir.json");
      await (
        await import("node:fs/promises")
      ).writeFile(
        irPath,
        JSON.stringify({
          irVersion: 1,
          nodes: { n1: { type: "LiveOnlyNode", params: { value: 1 }, inputs: {} } },
          outputs: [],
        }),
      );

      // Bundled defs would fail with E_UNKNOWN_NODE_TYPE; live defs succeed —
      // so passing proves the server's universe was used.
      const v = await comfy(["validate", irPath, "--url", url]);
      expect(v.code).toBe(0);
      const vBody = jsonOf<{
        ok: boolean;
        local: { errors: unknown[] };
        server: { mode?: string };
      }>(v.stdout);
      expect(vBody.ok).toBe(true);
      expect(vBody.local.errors).toEqual([]);
      expect(vBody.server.mode).toBe("local-against-live-defs");
      expect(objectInfoCount).toBeGreaterThan(0);
      expect(promptCount).toBe(0); // validate never executes

      const r = await comfy(["run", irPath, "--url", url, "--out", join(dir, "out")]);
      expect(r.code).toBe(0);
      expect(promptCount).toBe(1); // exactly one queued execution
    } finally {
      server.close();
    }
  }, 30_000);

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

  it("pack validates the first-party t2i package", async () => {
    const res = await comfy(["pack", join(__dirname, "..", "packages", "workflow-t2i")]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("ok: package is publishable");
  });

  it("pack --json reports diagnostics machine-readably", async () => {
    const res = await comfy(["pack", join(__dirname, "..", "packages", "workflow-hires"), "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ ok: boolean; manifest: string; nodeClasses: { derived: string[] } }>(
      res.stdout,
    );
    expect(body.ok).toBe(true);
    expect(body.manifest).toBe("hires-text-to-image");
    expect(body.nodeClasses.derived).toContain("KSamplerAdvanced");
  });

  it("inspect reads manifest+IR without executing package JS", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-evil-"));
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "evil-pkg", version: "0.0.0", comfyWorkflow: "./comfy.workflow.json" }),
    );
    await fs.writeFile(
      join(dir, "comfy.workflow.json"),
      JSON.stringify({
        specVersion: 1,
        name: "evil",
        title: "Evil",
        entry: "./workflow.ir.json",
        parameters: {},
        outputs: [],
        requires: { nodeClasses: ["EmptyLatentImage"], nodePacks: [], models: [] },
      }),
    );
    await fs.writeFile(
      join(dir, "workflow.ir.json"),
      JSON.stringify({
        irVersion: 1,
        nodes: { n1: { type: "EmptyLatentImage", params: { width: 64, height: 64, batch_size: 1 }, inputs: {} } },
        outputs: [],
      }),
    );
    // Throws the instant it is imported — inspect must never import it.
    await fs.writeFile(join(dir, "index.js"), `throw new Error("pwned");`);
    const res = await comfy(["inspect", dir, "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ ok: boolean; manifest: { name: string }; nodeClasses: string[] }>(res.stdout);
    expect(body.ok).toBe(true);
    expect(body.manifest.name).toBe("evil");
    expect(body.nodeClasses).toEqual(["EmptyLatentImage"]);
  });

  it("inspect --url reports live node availability", async () => {
    const { createServer } = await import("node:http");
    const liveObjectInfo = {
      EmptyLatentImage: {
        input: { required: {} },
        output: ["LATENT"],
        output_name: ["LATENT"],
        name: "Empty Latent Image",
        category: "latent",
        output_node: false,
      },
    };
    const server = createServer((req, res) => {
      if ((req.url ?? "").endsWith("/object_info")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(liveObjectInfo));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await comfy([
        "inspect",
        join(__dirname, "..", "packages", "workflow-t2i"),
        "--url",
        `http://127.0.0.1:${port}`,
        "--json",
      ]);
      expect(res.code).toBe(0);
      const body = jsonOf<{ live: { available: string[]; missing: string[] } }>(res.stdout);
      // Mock server only knows EmptyLatentImage — the rest must be missing.
      expect(body.live.available).toEqual(["EmptyLatentImage"]);
      expect(body.live.missing).toContain("KSampler");
    } finally {
      server.close();
    }
  });

  it("run resolves an installed package by name without running its JS", async () => {
    // Simulate `pnpm add evil-pkg`: a node_modules dir with the package.
    const dir = mkdtempSync(join(tmpdir(), "cwf-consumer-"));
    const fs = await import("node:fs/promises");
    const { createServer } = await import("node:http");
    const pkgDir = join(dir, "node_modules", "evil-run-pkg");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "evil-run-pkg", version: "0.0.0", comfyWorkflow: "./comfy.workflow.json" }),
    );
    await fs.writeFile(
      join(pkgDir, "comfy.workflow.json"),
      JSON.stringify({
        specVersion: 1,
        name: "evil-run",
        title: "Evil Run",
        entry: "./workflow.ir.json",
        parameters: {},
        outputs: [],
        requires: { nodeClasses: [], nodePacks: [], models: [] },
      }),
    );
    await fs.writeFile(
      join(pkgDir, "workflow.ir.json"),
      JSON.stringify({
        irVersion: 1,
        nodes: { n1: { type: "EmptyLatentImage", params: { width: 64, height: 64, batch_size: 1 }, inputs: {} } },
        outputs: [],
      }),
    );
    await fs.writeFile(join(pkgDir, "index.js"), `throw new Error("pwned");`);
    // Minimal mock Comfy: object_info + prompt + history with no outputs.
    const server = createServer((req, res) => {
      const url = req.url ?? "";
      res.setHeader("Content-Type", "application/json");
      if (url.endsWith("/object_info")) {
        res.end(
          JSON.stringify({
            EmptyLatentImage: {
              input: {
                required: {
                  width: ["INT", { default: 512, min: 16 }],
                  height: ["INT", { default: 512, min: 16 }],
                  batch_size: ["INT", { default: 1, min: 1 }],
                },
              },
              output: ["LATENT"],
              output_name: ["LATENT"],
              name: "Empty Latent Image",
              category: "latent",
              output_node: false,
            },
          }),
        );
        return;
      }
      if (url.endsWith("/prompt")) {
        res.end(JSON.stringify({ prompt_id: "pkg-run", number: 1 }));
        return;
      }
      if (url.includes("/history/")) {
        res.end(JSON.stringify({ "pkg-run": { status: { completed: true }, outputs: {} } }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      // Run from the consumer dir so bare-specifier resolution finds it.
      // --import needs an absolute jiti path since cwd no longer resolves it.
      const entry = join(__dirname, "..", "src", "cli", "bin.ts");
      const { pathToFileURL } = await import("node:url");
      const jitiRegister = pathToFileURL(
        join(__dirname, "..", "node_modules", "jiti", "lib", "jiti-register.mjs"),
      ).href;
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const runChild = promisify(execFile);
      const { stdout } = await runChild(
        "node",
        ["--import", jitiRegister, entry, "run", "evil-run-pkg", "--url", `http://127.0.0.1:${port}`],
        { cwd: dir },
      );
      expect(stdout).toContain('"ok": true');
    } finally {
      server.close();
    }
  }, 30_000);
});
