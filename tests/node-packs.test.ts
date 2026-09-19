import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  checkPackageCoherence,
  comfyNodeInstallCommand,
  generatePackage,
  inferPackageName,
  isCoreNodeClass,
  parseNodePack,
  parseWorkflowManifest,
  stringifyManifest,
  writeManifestFile,
  type WorkflowManifest,
  type WorkflowNodePack,
} from "../src/index.js";

const run = promisify(execFile);

async function cwf(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ stdout: string; code: number; stderr: string }> {
  const entry = join(__dirname, "..", "src", "cli", "bin.ts");
  try {
    const { stdout, stderr } = await run("node", ["--import", "jiti/register", entry, ...args], {
      cwd: opts.cwd ?? join(__dirname, ".."),
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

const BASE_MANIFEST = {
  specVersion: 1 as const,
  name: "video",
  title: "Video",
  entry: "./workflow.ir.json",
  parameters: {},
  outputs: [],
  requires: {
    nodeClasses: ["VHS_LoadVideo", "VHS_VideoCombine", "KSampler"],
    nodePacks: [] as WorkflowNodePack[],
    models: [] as Array<{ kind: string; name: string }>,
  },
};

function vhsIr() {
  return {
    irVersion: 1,
    nodes: {
      n1: { type: "VHS_LoadVideo", params: {}, inputs: {} },
      n2: { type: "VHS_VideoCombine", params: {}, inputs: {} },
      n3: { type: "KSampler", params: {}, inputs: {} },
    },
    outputs: [],
  };
}

function writePkg(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "cwf-packs-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(dir, rel.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function customPkg(opts: {
  classes?: string[];
  packs?: unknown[];
  extraFiles?: Record<string, string>;
}): string {
  const classes = opts.classes ?? ["VHS_LoadVideo", "VHS_VideoCombine"];
  const nodes: Record<string, unknown> = {};
  classes.forEach((c, i) => {
    nodes[`n${i + 1}`] = { type: c, params: {}, inputs: {} };
  });
  const packs = opts.packs ?? [];
  const specVersion = packs.some((p) => typeof p === "object") ? 2 : 1;
  const manifest = {
    specVersion,
    name: "custom",
    title: "Custom",
    entry: "./workflow.ir.json",
    parameters: {},
    outputs: [],
    requires: { nodeClasses: classes, nodePacks: packs, models: [] },
  };
  return writePkg({
    "package.json": JSON.stringify({
      name: "custom-wf",
      version: "0.1.0",
      keywords: ["comfy-workflow", "comfyui", "comfy-workflows"],
      comfyWorkflow: "./comfy.workflow.json",
    }),
    "comfy.workflow.json": JSON.stringify(manifest),
    "workflow.ir.json": JSON.stringify({ irVersion: 1, nodes, outputs: [] }),
    "index.js": `throw new Error("executed!");`,
    ...(opts.extraFiles ?? {}),
  });
}

describe("manifest nodePacks schema", () => {
  it("legacy string nodePacks still parse", () => {
    const m = parseWorkflowManifest({
      ...BASE_MANIFEST,
      requires: { ...BASE_MANIFEST.requires, nodePacks: ["comfyui-videohelpersuite"] },
    });
    expect(m.specVersion).toBe(1);
    expect(m.requires.nodePacks).toEqual([{ id: "comfyui-videohelpersuite", source: "manual" }]);
  });

  it("specVersion 1 rejects rich objects", () => {
    expect(() =>
      parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 1,
        requires: {
          ...BASE_MANIFEST.requires,
          nodePacks: [{ id: "comfyui-videohelpersuite" }],
        },
      }),
    ).toThrow(/specVersion 1/);
  });

  it("specVersion 2 rejects string ids", () => {
    expect(() =>
      parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: { ...BASE_MANIFEST.requires, nodePacks: ["comfyui-videohelpersuite"] },
      }),
    ).toThrow(/specVersion 2/);
  });

  it("v2 omitted source defaults to registry; explicit manual is preserved", () => {
    const omitted = parseNodePack({ id: "comfyui-videohelpersuite", version: "^1.8.0" });
    expect(omitted.source).toBe("registry");
    const explicit = parseNodePack({ id: "gemmy-h3-context", source: "manual" });
    expect(explicit.source).toBe("manual");
    const v2 = parseWorkflowManifest({
      ...BASE_MANIFEST,
      specVersion: 2,
      requires: {
        ...BASE_MANIFEST.requires,
        nodePacks: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"] }],
      },
    });
    expect(v2.requires.nodePacks[0]?.source).toBe("registry");
  });

  it("registry-id metadata parses", () => {
    const m = parseWorkflowManifest({
      ...BASE_MANIFEST,
      specVersion: 2,
      requires: {
        ...BASE_MANIFEST.requires,
        nodePacks: [
          {
            id: "comfyui-videohelpersuite",
            name: "ComfyUI-VideoHelperSuite",
            version: "^1.7.0",
            repository: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
            provides: ["VHS_LoadVideo", "VHS_VideoCombine"],
            source: "registry",
          },
        ],
      },
    });
    expect(m.specVersion).toBe(2);
    expect(m.requires.nodePacks[0]?.id).toBe("comfyui-videohelpersuite");
    expect(m.requires.nodePacks[0]?.provides).toEqual(["VHS_LoadVideo", "VHS_VideoCombine"]);
    expect(m.requires.nodePacks[0]?.version).toBe("^1.7.0");
  });

  it("version constraint validates", () => {
    expect(() =>
      parseNodePack({ id: "comfyui-videohelpersuite", version: "^1.8.0" }),
    ).not.toThrow();
    expect(() => parseNodePack({ id: "x", version: "latest" })).toThrow(/semver/);
  });

  it("provides mapping validates", () => {
    expect(() => parseNodePack({ id: "pack", provides: ["Foo", ""] })).toThrow(/provides/);
  });

  it("invalid package metadata rejected", () => {
    expect(() => parseNodePack({ id: "../etc/passwd" })).toThrow(/valid Comfy Registry/);
    expect(() => parseNodePack({ id: "pack", install: "rm -rf /" })).toThrow(/install/);
    expect(() => parseNodePack({ id: "pack", shell: "whoami" })).toThrow(/shell/);
    expect(() => parseNodePack({ id: "pack", command: "x" })).toThrow(/command/);
  });

  it("stringifyManifest round-trips v2 packs", () => {
    const manifest = parseWorkflowManifest({
      ...BASE_MANIFEST,
      specVersion: 2,
      requires: {
        ...BASE_MANIFEST.requires,
        nodePacks: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"] }],
      },
    });
    const again = parseWorkflowManifest(JSON.parse(stringifyManifest(manifest)));
    expect(again.requires.nodePacks[0]?.id).toBe("comfyui-videohelpersuite");
    const dir = mkdtempSync(join(tmpdir(), "cwf-man-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", comfyWorkflow: "./comfy.workflow.json" }),
    );
    writeManifestFile(dir, again);
    expect(existsSync(join(dir, "comfy.workflow.json"))).toBe(true);
  });
});

describe("isCoreNodeClass", () => {
  it("treats bundled and known extras as core", () => {
    expect(isCoreNodeClass("KSampler")).toBe(true);
    expect(isCoreNodeClass("CLIPLoader")).toBe(true);
    expect(isCoreNodeClass("UNETLoader")).toBe(true);
    expect(isCoreNodeClass("LoadVideo")).toBe(true);
    expect(isCoreNodeClass("SaveVideo")).toBe(true);
    expect(isCoreNodeClass("VHS_LoadVideo")).toBe(false);
  });
});

describe("comfyNodeInstallCommand", () => {
  it("emits ids only, deduped, no version range", () => {
    expect(
      comfyNodeInstallCommand([
        { id: "comfyui-videohelpersuite", version: "^1.7.9" },
        { id: "comfyui-videohelpersuite" },
        { id: "was-node-suite-comfyui" },
      ]),
    ).toBe("comfy node install comfyui-videohelpersuite was-node-suite-comfyui");
    expect(comfyNodeInstallCommand([])).toBeUndefined();
  });
});

describe("pack diagnostics", () => {
  it("warns when non-core classes have no declared packs", () => {
    const manifest = parseWorkflowManifest({
      specVersion: 1,
      name: "x",
      title: "X",
      entry: "./workflow.ir.json",
      parameters: {},
      outputs: [],
      requires: { nodeClasses: ["VHS_LoadVideo"], nodePacks: [], models: [] },
    });
    const graph = {
      irVersion: 1 as const,
      nodes: { n1: { type: "VHS_LoadVideo", params: {}, inputs: {} } },
      outputs: [],
    };
    const report = checkPackageCoherence(manifest, graph as never);
    expect(report.diagnostics.map((d) => d.code)).toContain("W_PACK_UNRESOLVED_NODE_PACK");
  });

  it("does not warn when Registry ids are declared", () => {
    const manifest = parseWorkflowManifest({
      specVersion: 2,
      name: "x",
      title: "X",
      entry: "./workflow.ir.json",
      parameters: {},
      outputs: [],
      requires: {
        nodeClasses: ["VHS_LoadVideo"],
        nodePacks: [{ id: "comfyui-videohelpersuite" }],
        models: [],
      },
    });
    const graph = {
      irVersion: 1 as const,
      nodes: { n1: { type: "VHS_LoadVideo", params: {}, inputs: {} } },
      outputs: [],
    };
    const report = checkPackageCoherence(manifest, graph as never);
    expect(report.diagnostics.map((d) => d.code)).not.toContain("W_PACK_UNRESOLVED_NODE_PACK");
    expect(report.diagnostics.map((d) => d.code)).not.toContain("W_PACK_NODE_PACK_NO_PROVIDES");
  });
});

describe("inspect", () => {
  it("reports missing classes vs live object_info and never hits an installer", async () => {
    const dir = customPkg({
      classes: ["VHS_LoadVideo"],
      packs: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" }],
    });
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(req.url ?? "");
      if ((req.url ?? "").endsWith("/object_info")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ KSampler: { input: { required: {} }, output: [] } }));
        return;
      }
      res.statusCode = 404;
      res.end("no");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await cwf(["inspect", dir, "--url", `http://127.0.0.1:${port}`, "--json"]);
      expect(res.code).toBe(0);
      const body = jsonOf<{
        live: { missing: string[] };
        dependencies: {
          nodePacks: Array<{ id: string }>;
          installCommand: string | null;
          missing: number;
          ready: boolean | null;
        };
      }>(res.stdout);
      expect(body.live.missing).toContain("VHS_LoadVideo");
      expect(body.dependencies.nodePacks[0]?.id).toBe("comfyui-videohelpersuite");
      expect(body.dependencies.installCommand).toBe("comfy node install comfyui-videohelpersuite");
      expect(body.dependencies.ready).toBe(false);
      expect(hits.some((h) => h.includes("install"))).toBe(false);
    } finally {
      server.close();
    }
  });

  it("inspect without --url never executes package JS", async () => {
    const dir = customPkg({ classes: ["EmptyLatentImage"] });
    const res = await cwf(["inspect", dir, "--json"]);
    expect(res.code).toBe(0);
    expect(jsonOf<{ ok: boolean }>(res.stdout).ok).toBe(true);
  });
});

describe("removed installer commands", () => {
  it("setup / resolve-nodes / node-pack exit with E_REMOVED_COMMAND", async () => {
    for (const args of [
      ["setup", "."],
      ["resolve-nodes", "."],
      ["node-pack", "add", "x"],
    ]) {
      const res = await cwf(args);
      expect(res.code).toBe(1);
      const raw = `${res.stderr}\n${res.stdout}`;
      expect(raw).toMatch(/E_REMOVED_COMMAND/);
      expect(raw).toMatch(/comfy node install/);
    }
  });
});

describe("init README and pack", () => {
  it("generated README points at comfy node install, not cwf setup", () => {
    const generated = generatePackage({
      name: inferPackageName("vhs-demo"),
      graph: vhsIr() as never,
      nodePacks: [
        {
          id: "comfyui-videohelpersuite",
          provides: ["VHS_LoadVideo", "VHS_VideoCombine"],
          source: "registry",
        },
      ],
    });
    expect(generated.files["README.md"]).toContain("comfy node install comfyui-videohelpersuite");
    expect(generated.files["README.md"]).not.toContain("cwf setup");
    expect(generated.files["README.md"]).not.toContain("git clone");
  });

  it("existing workflow package remains backwards-compatible", () => {
    const pkgDir = join(__dirname, "..", "packages", "workflow-t2i");
    const man = parseWorkflowManifest(
      JSON.parse(readFileSync(join(pkgDir, "comfy.workflow.json"), "utf8")),
    ) as WorkflowManifest;
    expect(man.requires.nodePacks).toEqual([]);
    expect(man.requires.nodeClasses).toContain("KSampler");
  });

  it("pack diagnostics point at comfy node install", async () => {
    const dir = customPkg({ classes: ["VHS_LoadVideo"] });
    const res = await cwf(["pack", dir, "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ diagnostics: Array<{ code: string; hint?: string }> }>(res.stdout);
    const w = body.diagnostics.find((d) => d.code === "W_PACK_UNRESOLVED_NODE_PACK");
    expect(w?.hint).toMatch(/comfy node install/);
  });

  it("pack --publish does not fail merely because a class is undeclared", async () => {
    const dir = customPkg({ classes: ["VHS_LoadVideo"] });
    const res = await cwf(["pack", dir, "--publish", "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ ok: boolean; diagnostics: Array<{ code: string; level: string }> }>(
      res.stdout,
    );
    expect(body.ok).toBe(true);
    const w = body.diagnostics.find((d) => d.code === "W_PACK_UNRESOLVED_NODE_PACK");
    expect(w?.level).toBe("warning");
  });
});

describe("this SDK never installs Python", () => {
  it("CLI source has no cm-cli / comfy node install spawn", () => {
    const cli = readFileSync(join(__dirname, "..", "src", "cli", "cli.ts"), "utf8");
    expect(cli).not.toMatch(/applySetupPlan/);
    expect(cli).not.toMatch(/cm-cli/);
    expect(cli).not.toMatch(/spawn\(/);
    expect(cli).not.toMatch(/execFileSync\(\s*["']comfy["']/);
    const runFn = cli.slice(
      cli.indexOf("async function cmdRun"),
      cli.indexOf("async function cmdInit"),
    );
    expect(runFn).not.toMatch(/comfy node install/);
  });
});
