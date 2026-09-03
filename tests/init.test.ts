import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { importComfyJson } from "../src/import/index.js";
import { parseGraph } from "../src/ir/serialize.js";
import { parseJsonLossless } from "../src/lossless-parse.js";
import {
  analyzePortability,
  checkPackageCoherence,
  corePeerRange,
  deriveNodeClasses,
  exposeParam,
  generatePackage,
  inferPackageName,
} from "../src/wfpack/index.js";
import { coreDefs } from "./helpers.js";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = join(ROOT, "fixtures", "workflows");

async function cwf(args: string[]): Promise<{ stdout: string; code: number; stderr: string }> {
  const entry = join(ROOT, "src", "cli", "bin.ts");
  // Always spawn from the repo so `jiti/register` resolves. Package dirs
  // are passed as paths (`--out`, `--dir`, positional) rather than cwd.
  try {
    const { stdout, stderr } = await run("node", ["--import", "jiti/register", entry, ...args], {
      cwd: ROOT,
    });
    return { stdout, code: 0, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? "", code: err.code ?? 1, stderr: err.stderr ?? "" };
  }
}

const jsonOf = <T>(text: string): T => {
  const start = text.indexOf("{");
  return JSON.parse(text.slice(start)) as T;
};

function readFix(name: string): string {
  return readFileSync(join(FIX, name), "utf8");
}

describe("package name inference", () => {
  it("infers unscoped names from filenames", () => {
    const n = inferPackageName("portrait-v2.json");
    expect(n.npmName).toBe("portrait-v2");
    expect(n.title).toBe("Portrait V2");
    expect(n.dirName).toBe("portrait-v2");
  });

  it("accepts a scoped name without forcing @stepupgaming", () => {
    const n = inferPackageName("@alice/portrait");
    expect(n.npmName).toBe("@alice/portrait");
    expect(n.dirName).toBe("portrait");
    expect(n.workflowName).toBe("portrait");
  });
});

describe("cwf init from each Comfy format", () => {
  it("inits from editor v0.4 JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "from-ui");
    const res = await cwf([
      "init",
      "from-ui",
      "--from",
      join(FIX, "t2i.ui.json"),
      "--out",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ ok: boolean; nodeClasses: string[] }>(res.stdout);
    expect(body.ok).toBe(true);
    expect(existsSync(join(dest, "workflow.ir.json"))).toBe(true);
    expect(existsSync(join(dest, "comfy.workflow.json"))).toBe(true);
    expect(existsSync(join(dest, "workflow.ts"))).toBe(true);
    expect(existsSync(join(dest, "package.json"))).toBe(true);
    expect(existsSync(join(dest, "README.md"))).toBe(true);
    expect(existsSync(join(dest, ".gitignore"))).toBe(true);
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("inits from workflow v1 JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "from-v1");
    const res = await cwf([
      "init",
      "from-v1",
      "--from",
      join(FIX, "t2i.ui.v1.json"),
      "--out",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["8"]?.params["seed"]).toBe(987654321);
    expect(ir.nodes["7"]?.mode).toBe("bypassed");
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("inits from API JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "from-api");
    const res = await cwf([
      "init",
      "from-api",
      "--from",
      join(FIX, "t2i.api.json"),
      "--out",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(Object.keys(ir.nodes).sort()).toEqual(["3", "4", "5", "6", "7", "8", "9"]);
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });
});

describe("init preserves semantics", () => {
  it("keeps integers above 2^53", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "giant.json");
    writeFileSync(
      src,
      `{"n1":{"class_type":"KSampler","inputs":{"seed":18446744073709551615,"cfg":8}}}`,
    );
    const dest = join(dir, "giant-pkg");
    const res = await cwf(["init", "giant-pkg", "--from", src, "--out", dest, "--json"]);
    expect(res.code).toBe(0);
    const irText = readFileSync(join(dest, "workflow.ir.json"), "utf8");
    expect(irText).toContain('"$int":"18446744073709551615"');
    expect(parseGraph(irText).nodes["n1"].params["seed"]).toBe(18446744073709551615n);
  });

  it("keeps unknown custom nodes via IR/rawNode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "custom.json");
    writeFileSync(
      src,
      JSON.stringify({
        n1: { class_type: "TotallyUnknownCustom", inputs: { foo: "bar" } },
      }),
    );
    const dest = join(dir, "custom-pkg");
    const res = await cwf(["init", "custom-pkg", "--from", src, "--out", dest, "--json"]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["n1"].type).toBe("TotallyUnknownCustom");
    expect(ir.nodes["n1"].params["foo"]).toBe("bar");
    const ts = readFileSync(join(dest, "workflow.ts"), "utf8");
    expect(ts).toContain("rawNode");
    expect(ts).toContain("TotallyUnknownCustom");
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("generated README has install/inspect/run and a license warning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "readme-pkg");
    await cwf(["init", "readme-pkg", "--from", join(FIX, "t2i.api.json"), "--out", dest]);
    const readme = readFileSync(join(dest, "README.md"), "utf8");
    expect(readme).toContain("pnpm add readme-pkg");
    expect(readme).toContain("cwf inspect readme-pkg");
    expect(readme).toContain("cwf run readme-pkg");
    expect(readme.toLowerCase()).toMatch(/redistribution|license/);
    expect(readme).not.toMatch(/C:\\Projects\\comfy-sdk/);
    const pj = readFileSync(join(dest, "package.json"), "utf8");
    expect(pj).not.toMatch(/C:\\Projects\\comfy-sdk/);
    expect(pj).not.toContain("scripts/build-workflow-packages");
  });

  it("does not invent a @stepupgaming scope", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "portrait");
    await cwf(["init", "portrait", "--from", join(FIX, "t2i.api.json"), "--out", dest]);
    const pj = JSON.parse(readFileSync(join(dest, "package.json"), "utf8")) as { name: string };
    expect(pj.name).toBe("portrait");
  });
});

describe("portability analysis", () => {
  it("warns on checkpoint literals, Windows paths, and Unix paths", () => {
    const graph = importComfyJson(
      {
        n4: {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "juggernautXL_v9.safetensors" },
        },
        n17: { class_type: "LoadVideo", inputs: { video: "C:\\Users\\Alice\\Videos\\input.mp4" } },
        n18: { class_type: "LoadImage", inputs: { image: "/tmp/in.png" } },
      },
      coreDefs,
    ).graph;
    const findings = analyzePortability(graph);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("checkpoint");
    expect(findings.some((f) => f.kind === "input-path" && f.value.includes("Alice"))).toBe(true);
    expect(findings.some((f) => f.kind === "input-path" && f.value === "/tmp/in.png")).toBe(true);
  });

  it("init --json reports Windows and Unix path warnings without rewriting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "paths.json");
    writeFileSync(
      src,
      JSON.stringify({
        n4: {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "juggernautXL_v9.safetensors" },
        },
        n17: {
          class_type: "VHS_LoadVideo",
          inputs: { video: "C:\\Users\\Alice\\Videos\\input.mp4" },
        },
        n18: { class_type: "LoadImage", inputs: { image: "/home/alice/in.png" } },
      }),
    );
    const dest = join(dir, "paths-pkg");
    const res = await cwf(["init", "paths-pkg", "--from", src, "--out", dest, "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{
      portability: Array<{ kind: string; nodeId: string; input: string; value: string }>;
    }>(res.stdout);
    expect(body.portability.some((p) => p.kind === "checkpoint")).toBe(true);
    expect(body.portability.some((p) => p.value.includes("Alice"))).toBe(true);
    expect(body.portability.some((p) => p.value === "/home/alice/in.png")).toBe(true);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["n17"].params["video"]).toBe("C:\\Users\\Alice\\Videos\\input.mp4");
    expect(ir.nodes["n18"].params["image"]).toBe("/home/alice/in.png");
  });

  it("pack fails on a local path with E_PACK_LOCAL_PATH and an expose hint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "local.json");
    writeFileSync(
      src,
      JSON.stringify({
        n17: {
          class_type: "VHS_LoadVideo",
          inputs: { video: "C:\\Users\\Alice\\Videos\\input.mp4" },
        },
      }),
    );
    const dest = join(dir, "local-pkg");
    await cwf(["init", "local-pkg", "--from", src, "--out", dest]);
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(1);
    const body = jsonOf<{ diagnostics: Array<{ code: string; message: string; hint?: string }> }>(
      pack.stdout,
    );
    const err = body.diagnostics.find((d) => d.code === "E_PACK_LOCAL_PATH");
    expect(err).toBeDefined();
    expect(err?.message).toContain("n17");
    expect(err?.message).toContain("video");
    expect(err?.hint).toMatch(/cwf expose/);
  });
});

describe("cwf expose", () => {
  async function initedApi(): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "pkg");
    const res = await cwf(["init", "pkg", "--from", join(FIX, "t2i.api.json"), "--out", dest]);
    expect(res.code).toBe(0);
    return dest;
  }

  it("promotes a string widget and keeps a default", async () => {
    const dest = await initedApi();
    const res = await cwf([
      "expose",
      "prompt",
      "--node",
      "6",
      "--input",
      "text",
      "--dir",
      dest,
      "--json",
    ]);
    expect(res.code, res.stderr || res.stdout).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["6"].params["text"]).toEqual({ $param: "prompt" });
    expect(ir.params?.["prompt"]?.default).toBe("masterful photograph of a lighthouse at dusk");
    const man = JSON.parse(readFileSync(join(dest, "comfy.workflow.json"), "utf8")) as {
      parameters: Record<string, { required: boolean; type: string }>;
    };
    expect(man.parameters["prompt"].required).toBe(false);
    expect(man.parameters["prompt"].type).toBe("string");
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("promotes seed as int/bigint", async () => {
    const dest = await initedApi();
    const res = await cwf([
      "expose",
      "seed",
      "--node",
      "3",
      "--input",
      "seed",
      "--dir",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["3"].params["seed"]).toEqual({ $param: "seed" });
    expect(ir.params?.["seed"]?.type).toBe("int");
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("promotes a numeric width", async () => {
    const dest = await initedApi();
    const res = await cwf([
      "expose",
      "width",
      "--node",
      "5",
      "--input",
      "width",
      "--dir",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["5"].params["width"]).toEqual({ $param: "width" });
    expect(ir.params?.["width"]?.default).toBe(512);
    expect(ir.params?.["width"]?.type).toBe("int");
  });

  it("required drops the default; path expose is required without a portable default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "local.json");
    writeFileSync(
      src,
      JSON.stringify({
        n17: {
          class_type: "VHS_LoadVideo",
          inputs: { video: "C:\\Users\\Alice\\Videos\\input.mp4" },
        },
      }),
    );
    const dest = join(dir, "local-pkg");
    await cwf(["init", "local-pkg", "--from", src, "--out", dest]);
    const req = await cwf([
      "expose",
      "promptish",
      "--node",
      "n17",
      "--input",
      "video",
      "--required",
      "--dir",
      dest,
      "--json",
    ]);
    expect(req.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.params?.["promptish"]?.default).toBeUndefined();
  });

  it("exposing a path without --required still drops the machine-local default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const src = join(dir, "local.json");
    writeFileSync(
      src,
      JSON.stringify({
        n17: { class_type: "VHS_LoadVideo", inputs: { video: "/home/alice/in.mp4" } },
      }),
    );
    const dest = join(dir, "local-pkg");
    await cwf(["init", "local-pkg", "--from", src, "--out", dest]);
    const res = await cwf([
      "expose",
      "input-video",
      "--node",
      "n17",
      "--input",
      "video",
      "--dir",
      dest,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    expect(ir.nodes["n17"].params["video"]).toEqual({ $param: "input-video" });
    expect(ir.params?.["input-video"]?.default).toBeUndefined();
    const man = JSON.parse(readFileSync(join(dest, "comfy.workflow.json"), "utf8")) as {
      parameters: Record<string, { required: boolean }>;
    };
    expect(man.parameters["input-video"].required).toBe(true);
    const pack = await cwf(["pack", dest, "--json"]);
    expect(pack.code).toBe(0);
  });

  it("fails atomically: missing node does not rewrite files", async () => {
    const dest = await initedApi();
    const beforeIr = readFileSync(join(dest, "workflow.ir.json"), "utf8");
    const beforeMan = readFileSync(join(dest, "comfy.workflow.json"), "utf8");
    const beforeTs = readFileSync(join(dest, "workflow.ts"), "utf8");
    const res = await cwf([
      "expose",
      "nope",
      "--node",
      "missing",
      "--input",
      "text",
      "--dir",
      dest,
    ]);
    expect(res.code).toBe(1);
    expect(readFileSync(join(dest, "workflow.ir.json"), "utf8")).toBe(beforeIr);
    expect(readFileSync(join(dest, "comfy.workflow.json"), "utf8")).toBe(beforeMan);
    expect(readFileSync(join(dest, "workflow.ts"), "utf8")).toBe(beforeTs);
  });

  it("keeps the manifest synchronized and node requirements correct", async () => {
    const dest = await initedApi();
    await cwf([
      "expose",
      "checkpoint",
      "--node",
      "4",
      "--input",
      "ckpt_name",
      "--required",
      "--dir",
      dest,
    ]);
    const man = JSON.parse(readFileSync(join(dest, "comfy.workflow.json"), "utf8")) as {
      parameters: Record<string, unknown>;
      requires: { nodeClasses: string[] };
    };
    const ir = parseGraph(readFileSync(join(dest, "workflow.ir.json"), "utf8"));
    const report = checkPackageCoherence(man as never, ir);
    expect(report.ok).toBe(true);
    expect([...man.requires.nodeClasses].sort()).toEqual(deriveNodeClasses(ir));
    expect(Object.keys(man.parameters).sort()).toEqual(Object.keys(ir.params ?? {}).sort());
  });
});

describe("cwf suggest", () => {
  it("is deterministic and does not mutate files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cwf-init-"));
    const dest = join(dir, "pkg");
    await cwf(["init", "pkg", "--from", join(FIX, "t2i.api.json"), "--out", dest]);
    const before = {
      ir: readFileSync(join(dest, "workflow.ir.json"), "utf8"),
      man: readFileSync(join(dest, "comfy.workflow.json"), "utf8"),
      ts: readFileSync(join(dest, "workflow.ts"), "utf8"),
    };
    const a = await cwf(["suggest", dest, "--json"]);
    const b = await cwf(["suggest", dest, "--json"]);
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    const body = jsonOf<{ suggestions: Array<{ name: string; nodeId: string; input: string }> }>(
      a.stdout,
    );
    const names = body.suggestions.map((s) => s.name);
    expect(names).toContain("checkpoint");
    expect(names).toContain("prompt");
    expect(names).toContain("seed");
    expect(readFileSync(join(dest, "workflow.ir.json"), "utf8")).toBe(before.ir);
    expect(readFileSync(join(dest, "comfy.workflow.json"), "utf8")).toBe(before.man);
    expect(readFileSync(join(dest, "workflow.ts"), "utf8")).toBe(before.ts);
  });
});

describe("library generatePackage / exposeParam", () => {
  it("generatePackage is a complete standalone set", () => {
    const graph = importComfyJson(parseJsonLossless(readFix("t2i.api.json")), coreDefs).graph;
    const result = generatePackage({
      name: inferPackageName("demo"),
      graph,
      defs: coreDefs,
    });
    expect(Object.keys(result.files).sort()).toEqual(
      [
        ".gitignore",
        "README.md",
        "comfy.workflow.json",
        "package.json",
        "workflow.ir.json",
        "workflow.ts",
      ].sort(),
    );
    const pj = JSON.parse(result.files["package.json"]) as {
      peerDependencies?: Record<string, string>;
    };
    const core = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      version: string;
    };
    const [maj, min] = core.version.split(".");
    const expected = Number(maj) === 0 ? `^0.${min}.0` : `^${maj}.0.0`;
    expect(pj.peerDependencies?.["@stepupgaming/comfy-workflows"]).toBe(expected);
    expect(expected).not.toBe("^0.1.0");
    const man = JSON.parse(result.files["comfy.workflow.json"]) as { coreVersion?: string };
    expect(man.coreVersion).toBe(expected);
  });

  it("corePeerRange follows the 0.x minor policy", () => {
    expect(corePeerRange("0.2.1")).toBe("^0.2.0");
    expect(corePeerRange("0.3.0")).toBe("^0.3.0");
    expect(corePeerRange("1.2.3")).toBe("^1.0.0");
  });

  it("exposeParam is pure", () => {
    const graph = importComfyJson(parseJsonLossless(readFix("t2i.api.json")), coreDefs).graph;
    const before = graph.nodes["4"].params["ckpt_name"];
    const { graph: next } = exposeParam(graph, {
      name: "checkpoint",
      nodeId: "4",
      input: "ckpt_name",
      defs: coreDefs,
    });
    expect(graph.nodes["4"].params["ckpt_name"]).toBe(before);
    expect(next.nodes["4"].params["ckpt_name"]).toEqual({ $param: "checkpoint" });
  });
});
