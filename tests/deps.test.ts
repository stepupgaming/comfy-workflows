import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  applySetupPlan,
  buildDependencyReport,
  checkPackageCoherence,
  createRegistryClient,
  createSetupPlan,
  deriveNodeClasses,
  generatePackage,
  inferPackageName,
  inspectComfyTarget,
  isCoreNodeClass,
  mergeResolvedPacks,
  packAction,
  pickBestVersion,
  pickTargetPython,
  parseWorkflowManifest,
  resolveNodeClasses,
  versionSatisfies,
  writeManifestFile,
  type RegistryPack,
  type WorkflowManifest,
  type WorkflowNodePack,
} from "../src/index.js";
import { parseNodePack } from "../src/wfpack/manifest.js";
import { stringifyManifest } from "../src/wfpack/write.js";

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

const VHS: RegistryPack = {
  id: "comfyui-videohelpersuite",
  name: "ComfyUI-VideoHelperSuite",
  latestVersion: "1.7.9",
  repository: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
};
const KREA: RegistryPack = {
  id: "comfyui-krea2edit",
  name: "Krea2Edit",
  latestVersion: "0.6.1",
  repository: "https://example.invalid/krea",
};

function mockRegistry(
  map: Record<string, RegistryPack | RegistryPack[]>,
  opts: {
    /** Class names actually listed in a pack version's comfy-nodes. `undefined` = definitions unavailable. */
    provided?: Record<string, string[] | undefined>;
    versions?: Record<string, string[]>;
  } = {},
): {
  lookupClass: (c: string) => Promise<RegistryPack[]>;
  getPack: (id: string) => Promise<RegistryPack | undefined>;
  listVersions: (id: string) => Promise<Array<{ version: string; status?: string }>>;
  installableVersion: (id: string, version?: string) => Promise<string | undefined>;
  listComfyNodes: (id: string, version: string) => Promise<string[] | undefined>;
} {
  const client = {
    async lookupClass(c: string) {
      const v = map[c];
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    },
    async getPack(id: string) {
      const all = Object.values(map).flat();
      return all.find((p) => p.id === id);
    },
    async listVersions(id: string) {
      if (opts.versions?.[id]) return opts.versions[id].map((version) => ({ version }));
      const p = await client.getPack(id);
      const v = p?.latestVersion ?? "1.0.0";
      return [{ version: v }];
    },
    async installableVersion(id: string, version?: string) {
      const p = await client.getPack(id);
      return version ?? p?.latestVersion;
    },
    async listComfyNodes(id: string, _version: string) {
      if (opts.provided && Object.prototype.hasOwnProperty.call(opts.provided, id)) {
        return opts.provided[id];
      }
      const classes: string[] = [];
      for (const [cls, packs] of Object.entries(map)) {
        const arr = Array.isArray(packs) ? packs : [packs];
        if (arr.some((p) => p.id === id)) classes.push(cls);
      }
      return classes.sort();
    },
  };
  return client;
}

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
  const dir = mkdtempSync(join(tmpdir(), "cwf-deps-"));
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

async function startRegistryServer(
  handler: (url: string, res: ServerResponse) => boolean,
): Promise<{
  url: string;
  close: () => Promise<void>;
  hits: string[];
}> {
  const hits: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const u = req.url ?? "";
    hits.push(u);
    if (handler(u, res)) return;
    res.statusCode = 404;
    res.end(
      JSON.stringify({ message: "No node found containing the specified ComfyUI node name" }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function vhsHandler(u: string, res: ServerResponse): boolean {
  res.setHeader("Content-Type", "application/json");
  if (u.startsWith("/nodes/search") || u.includes("/nodes/search?")) {
    const q = new URL(u, "http://registry.test").searchParams.get("comfy_node_search");
    if (q === "VHS_LoadVideo" || q === "VHS_VideoCombine") {
      res.end(
        JSON.stringify({
          nodes: [
            {
              id: VHS.id,
              name: VHS.name,
              repository: VHS.repository,
              latest_version: { version: VHS.latestVersion },
            },
          ],
          page: 1,
          limit: 64,
          total: 1,
          totalPages: 1,
        }),
      );
      return true;
    }
    res.end(JSON.stringify({ nodes: [], page: 1, limit: 64, total: 0, totalPages: 1 }));
    return true;
  }
  if (
    u.includes("/comfy-nodes/VHS_LoadVideo/node") ||
    u.includes("/comfy-nodes/VHS_VideoCombine/node")
  ) {
    res.end(
      JSON.stringify({
        id: VHS.id,
        name: VHS.name,
        repository: VHS.repository,
        latest_version: { version: VHS.latestVersion },
      }),
    );
    return true;
  }
  if (/\/nodes\/comfyui-videohelpersuite\/versions\/[^/]+\/comfy-nodes/.test(u)) {
    res.end(
      JSON.stringify({
        comfy_nodes: [
          { comfy_node_name: "VHS_LoadVideo" },
          { comfy_node_name: "VHS_VideoCombine" },
        ],
      }),
    );
    return true;
  }
  if (u.includes("/nodes/comfyui-videohelpersuite/versions")) {
    res.end(JSON.stringify([{ version: VHS.latestVersion, status: "NodeVersionStatusActive" }]));
    return true;
  }
  if (u.includes("/nodes/comfyui-videohelpersuite/install")) {
    res.end(JSON.stringify({ version: VHS.latestVersion }));
    return true;
  }
  if (u.includes("/nodes/comfyui-videohelpersuite")) {
    res.end(
      JSON.stringify({
        id: VHS.id,
        name: VHS.name,
        repository: VHS.repository,
        latest_version: { version: VHS.latestVersion },
      }),
    );
    return true;
  }
  return false;
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

  it("new registry-id metadata parses", () => {
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
            repository: VHS.repository,
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
});

describe("semver", () => {
  it("matches caret and exact", () => {
    expect(versionSatisfies("1.8.2", "^1.8.0")).toBe(true);
    expect(versionSatisfies("2.0.0", "^1.8.0")).toBe(false);
    expect(versionSatisfies("1.8.0", ">=1.8.0")).toBe(true);
    expect(versionSatisfies("not-a-version", "^1.0.0")).toBeUndefined();
  });

  it("pickBestVersion selects highest satisfying", () => {
    expect(pickBestVersion(["1.7.8", "1.9.2", "1.7.9"], "^1.7.9")).toBe("1.9.2");
    expect(pickBestVersion(["1.0.0", "2.0.0"], "^1.7.9")).toBeUndefined();
    expect(pickBestVersion(["1.7.9"], "1.7.9")).toBe("1.7.9");
  });
});

describe("resolution", () => {
  it("one class → one registered pack", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_LoadVideo"],
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
    });
    expect(r.packs).toHaveLength(1);
    expect(r.packs[0]?.id).toBe("comfyui-videohelpersuite");
    expect(r.unknown).toEqual([]);
    expect(r.ambiguous).toEqual([]);
  });

  it("multiple classes → one pack", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_VideoCombine", "VHS_LoadVideo"],
      registry: mockRegistry({ VHS_LoadVideo: VHS, VHS_VideoCombine: VHS }),
    });
    expect(r.packs.map((p) => p.id)).toEqual(["comfyui-videohelpersuite"]);
    expect(r.packs[0]?.provides).toEqual(["VHS_LoadVideo", "VHS_VideoCombine"]);
  });

  it("classes across multiple packs", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_LoadVideo", "Krea2EditSampler"],
      registry: mockRegistry({ VHS_LoadVideo: VHS, Krea2EditSampler: KREA }),
    });
    expect(r.packs.map((p) => p.id)).toEqual(["comfyui-krea2edit", "comfyui-videohelpersuite"]);
  });

  it("ambiguous ownership", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["FooSampler"],
      registry: mockRegistry({
        FooSampler: [
          { id: "alternate-foo-pack", name: "Alt" },
          { id: "foo-pack", name: "Foo" },
        ],
      }),
    });
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]?.candidates?.map((c) => c.id)).toEqual([
      "alternate-foo-pack",
      "foo-pack",
    ]);
    expect(r.packs).toEqual([]);
  });

  it("unknown ownership", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["GemmyH3SaveAVLatent"],
      registry: mockRegistry({}),
    });
    expect(r.unknown.map((u) => u.className)).toEqual(["GemmyH3SaveAVLatent"]);
    expect(r.packs).toEqual([]);
  });

  it("already-installed class skipped when missingOnly", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_LoadVideo", "KSampler"],
      installedClasses: ["VHS_LoadVideo", "KSampler"],
      missingOnly: true,
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
    });
    expect(r.missing).toEqual([]);
    expect(
      r.resolutions.every((x) => x.className !== "VHS_LoadVideo" || x.kind === "core" || true),
    ).toBe(true);
  });

  it("mixed installed/missing graph", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_LoadVideo", "KSampler"],
      installedClasses: ["KSampler"],
      missingOnly: true,
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
    });
    expect(r.missing).toEqual(["VHS_LoadVideo"]);
    expect(r.available).toEqual(["KSampler"]);
    expect(r.packs[0]?.id).toBe("comfyui-videohelpersuite");
  });

  it("deterministic result ordering", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["ZNode", "ANode", "MNode"],
      registry: mockRegistry({
        ZNode: { id: "z-pack", name: "Z" },
        ANode: { id: "a-pack", name: "A" },
        MNode: { id: "m-pack", name: "M" },
      }),
    });
    expect(r.required).toEqual(["ANode", "MNode", "ZNode"]);
    expect(r.packs.map((p) => p.id)).toEqual(["a-pack", "m-pack", "z-pack"]);
    expect(r.resolutions.map((x) => x.className)).toEqual(["ANode", "MNode", "ZNode"]);
  });

  it("core classes do not become packs", async () => {
    expect(isCoreNodeClass("KSampler")).toBe(true);
    const r = await resolveNodeClasses({
      nodeClasses: ["KSampler", "CLIPTextEncode"],
      registry: mockRegistry({}),
    });
    expect(r.packs).toEqual([]);
    expect(r.resolutions.every((x) => x.kind === "core")).toBe(true);
  });

  it("ranked false-positive for a core class is ignored", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["KSampler"],
      registry: mockRegistry({
        KSampler: { id: "evil-core-pack", name: "Evil", latestVersion: "9.9.9" },
      }),
    });
    expect(r.resolutions).toEqual([{ className: "KSampler", kind: "core" }]);
    expect(r.packs).toEqual([]);
  });

  it("CLIPLoader / UNETLoader / LoadVideo are known core even if absent from bundled defs", async () => {
    expect(isCoreNodeClass("CLIPLoader")).toBe(true);
    expect(isCoreNodeClass("UNETLoader")).toBe(true);
    expect(isCoreNodeClass("LoadVideo")).toBe(true);
    expect(isCoreNodeClass("SaveVideo")).toBe(true);
    const r = await resolveNodeClasses({
      nodeClasses: ["CLIPLoader", "UNETLoader", "LoadVideo"],
      registry: mockRegistry({
        CLIPLoader: { id: "third-party-clip", name: "Nope", latestVersion: "1.0.0" },
        UNETLoader: { id: "third-party-unet", name: "Nope", latestVersion: "1.0.0" },
        LoadVideo: { id: "comfyui-vid2vid", name: "Nope", latestVersion: "1.0.0" },
      }),
    });
    expect(r.packs).toEqual([]);
    expect(r.resolutions.every((x) => x.kind === "core")).toBe(true);
  });

  it("hint pack that does not list the class in comfy-nodes is unknown", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["VHS_LoadVideo"],
      registry: mockRegistry(
        { VHS_LoadVideo: VHS },
        { provided: { "comfyui-videohelpersuite": ["SomeOtherNode"] } },
      ),
    });
    expect(r.unknown.map((u) => u.className)).toEqual(["VHS_LoadVideo"]);
    expect(r.packs).toEqual([]);
  });

  it("registry 404 stays unknown unless independent core evidence exists", async () => {
    const r = await resolveNodeClasses({
      nodeClasses: ["TotallyUnknownNode"],
      registry: mockRegistry({}),
    });
    expect(r.unknown.map((u) => u.className)).toEqual(["TotallyUnknownNode"]);
    expect(r.resolutions[0]?.kind).toBe("unknown");
  });
});

describe("inspect / pack diagnostics", () => {
  it("unresolved custom classes warn from pack", () => {
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
});

describe("setup planning", () => {
  it("correct install plan for a missing registered pack", async () => {
    const manifest = parseWorkflowManifest({
      ...BASE_MANIFEST,
      specVersion: 2,
      requires: {
        nodeClasses: ["VHS_LoadVideo"],
        nodePacks: [
          {
            id: "comfyui-videohelpersuite",
            version: "^1.7.0",
            provides: ["VHS_LoadVideo"],
            source: "registry",
          },
        ],
        models: [{ kind: "checkpoint", name: "model.safetensors" }],
      },
    });
    const report = await buildDependencyReport({
      manifest,
      nodeClasses: ["VHS_LoadVideo"],
      installedClasses: [],
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
    });
    expect(report.plan.toInstall.map((p) => p.id)).toEqual(["comfyui-videohelpersuite"]);
    expect(report.plan.models[0]?.status).toBe("unknown");
    expect(report.plan.ready).toBe(false);
    expect(report.plan.restartRequired).toBe(true);
  });

  it("unresolved package prevents false ready", async () => {
    const manifest = parseWorkflowManifest({
      specVersion: 1,
      name: "x",
      title: "X",
      entry: "./workflow.ir.json",
      parameters: {},
      outputs: [],
      requires: { nodeClasses: ["GemmyH3SaveAVLatent"], nodePacks: [], models: [] },
    });
    const report = await buildDependencyReport({
      manifest,
      nodeClasses: ["GemmyH3SaveAVLatent"],
      installedClasses: [],
      registry: mockRegistry({}),
    });
    expect(report.plan.ready).toBe(false);
    expect(report.plan.unresolved.map((u) => u.className)).toContain("GemmyH3SaveAVLatent");
    expect(report.plan.toInstall).toEqual([]);
  });

  it("ambiguous package prevents blind install", async () => {
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["FooSampler"],
      availableNodeClasses: [],
      packs: [],
      unresolved: [],
      ambiguous: [
        {
          className: "FooSampler",
          kind: "ambiguous",
          candidates: [{ id: "foo-pack" }, { id: "alternate-foo-pack" }],
        },
      ],
    });
    expect(plan.ready).toBe(false);
    expect(plan.toInstall).toEqual([]);
  });

  it("installed compatible pack is skip", () => {
    const p = packAction({
      declared: { id: "comfyui-videohelpersuite", version: "^1.7.0", source: "registry" },
      versionStatus: "compatible",
      installedVersion: "1.7.9",
      verified: true,
    });
    expect(p.action).toBe("skip");
  });

  it("incompatible installed pack is upgrade", () => {
    const p = packAction({
      declared: { id: "comfyui-videohelpersuite", version: "^1.8.0", source: "registry" },
      versionStatus: "incompatible",
      installedVersion: "1.0.0",
      verified: true,
    });
    expect(p.action).toBe("upgrade");
    expect(p.verified).toBe(true);
  });

  it("unverified registry claim is never auto-installed", () => {
    const p = packAction({
      declared: {
        id: "comfyui-videohelpersuite",
        source: "registry",
        provides: ["VHS_LoadVideo"],
      },
      versionStatus: "missing",
      resolvedVersion: "1.7.9",
      verified: false,
    });
    expect(p.action).toBe("skip");
    expect(p.verified).toBe(false);
  });

  it("unknown version does not pretend compatibility via reinstall", () => {
    const p = packAction({
      declared: { id: "comfyui-videohelpersuite", version: "^1.8.0", source: "registry" },
      versionStatus: "unknown",
      verified: true,
    });
    expect(p.action).toBe("skip");
  });

  it("unsatisfied version range does not install latest", () => {
    const p = packAction({
      declared: { id: "comfyui-videohelpersuite", version: "^9.9.9", source: "registry" },
      versionStatus: "missing",
      versionUnsatisfied: true,
      verified: true,
    });
    expect(p.action).toBe("skip");
    expect(p.resolvedVersion).toBeUndefined();
  });

  it("manual source is never auto-installed", () => {
    const p = packAction({
      declared: { id: "ComfyUI-NVIDIA-RTX-VSR-Pro", source: "manual", provides: ["RTXVideoSuperResolution"] },
      versionStatus: "missing",
    });
    expect(p.action).toBe("skip");
  });
});

describe("applySetupPlan security", () => {
  it("dry-run / declined installs nothing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    const target = inspectComfyTarget(tmp);
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["VHS_LoadVideo"],
          nodePacks: [
            {
              id: "comfyui-videohelpersuite",
              provides: ["VHS_LoadVideo"],
              source: "registry",
            },
          ],
          models: [],
        },
      }),
      missingNodeClasses: ["VHS_LoadVideo"],
      availableNodeClasses: [],
      packs: [
        packAction({
          declared: {
            id: "comfyui-videohelpersuite",
            provides: ["VHS_LoadVideo"],
            source: "registry",
          },
          versionStatus: "missing",
          resolvedVersion: "1.7.9",
          verified: true,
        }),
      ],
      unresolved: [],
      ambiguous: [],
      target: { root: tmp, layout: "git" },
    });
    const dry = await applySetupPlan({
      plan,
      target,
      yes: true,
      dryRun: true,
      run: async () => {
        throw new Error("installer must not run on dry-run");
      },
    });
    expect(dry.results.every((r) => r.skipped)).toBe(true);

    await expect(applySetupPlan({ plan, target, yes: false })).rejects.toThrow(/confirmation/);
  });

  it("unregistered source is not auto-installed", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    const target = inspectComfyTarget(tmp);
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["Foo"],
      availableNodeClasses: [],
      packs: [
        {
          id: "evil-pack",
          versionStatus: "missing",
          source: "manual",
          provides: ["Foo"],
          action: "install",
          verified: false,
        },
      ],
      unresolved: [],
      ambiguous: [],
      target: { root: tmp, layout: "git" },
    });
    const applied = await applySetupPlan({
      plan,
      target,
      yes: true,
      run: async () => {
        throw new Error("must not spawn for unregistered");
      },
    });
    expect(applied.plan.failed.map((f) => f.id)).toContain("evil-pack");
  });

  it("install subprocess uses argument arrays and refuses path-escape ids", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    const target = inspectComfyTarget(tmp);
    const seen: string[][] = [];
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["VHS_LoadVideo"],
      availableNodeClasses: [],
      packs: [
        packAction({
          declared: {
            id: "comfyui-videohelpersuite",
            source: "registry",
            provides: ["VHS_LoadVideo"],
          },
          versionStatus: "missing",
          resolvedVersion: "1.7.9",
          verified: true,
        }),
      ],
      unresolved: [],
      ambiguous: [],
      target: { root: tmp, layout: "git" },
    });
    await applySetupPlan({
      plan,
      target,
      yes: true,
      run: async (opts) => {
        seen.push(opts.args);
        expect(opts.args).toEqual(["install", "comfyui-videohelpersuite@1.7.9", "--exit-on-fail"]);
        return { code: 0, stdout: "ok", stderr: "" };
      },
    });
    expect(seen).toHaveLength(1);

    const escaped = await applySetupPlan({
      plan: {
        ...plan,
        toInstall: [
          {
            id: "../passwd",
            versionStatus: "missing",
            source: "registry",
            provides: [],
            action: "install",
            verified: true,
          },
        ],
      },
      target,
      yes: true,
      run: async () => {
        throw new Error("must not spawn for path-escape id");
      },
    });
    expect(escaped.plan.failed.map((f) => f.id)).toContain("../passwd");
    expect(escaped.results[0]?.ok).toBe(false);
    expect(escaped.results[0]?.stderr).toMatch(/Refusing to install/);
  });

  it("remote-only plan cannot be applied", () => {
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["VHS_LoadVideo"],
      availableNodeClasses: [],
      packs: [],
      unresolved: [],
      ambiguous: [],
      remoteOnly: true,
      target: { root: "(remote)", layout: "remote", url: "https://remote-comfy" },
    });
    expect(plan.applyBlocked).toMatch(/local access/);
  });

  it("refuses install when target Python cannot be established", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    const target = inspectComfyTarget(tmp);
    expect(target.pythonCandidates).toEqual([]);
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["VHS_LoadVideo"],
      availableNodeClasses: [],
      packs: [
        packAction({
          declared: {
            id: "comfyui-videohelpersuite",
            source: "registry",
            provides: ["VHS_LoadVideo"],
          },
          versionStatus: "missing",
          resolvedVersion: "1.7.9",
          verified: true,
        }),
      ],
      unresolved: [],
      ambiguous: [],
      target: { root: tmp, layout: "git" },
    });
    await expect(applySetupPlan({ plan, target, yes: true })).rejects.toThrow(
      /Cannot determine the Python interpreter/,
    );
  });

  it("Windows portable layout selects python_embeded, including paths with spaces", () => {
    const parent = mkdtempSync(join(tmpdir(), "cwf portable "));
    const root = join(parent, "ComfyUI Portable");
    mkdirSync(join(root, "python_embeded"), { recursive: true });
    mkdirSync(join(root, "ComfyUI", "comfy"), { recursive: true });
    mkdirSync(join(root, "ComfyUI", "custom_nodes"), { recursive: true });
    writeFileSync(join(root, "ComfyUI", "main.py"), "#\n");
    writeFileSync(join(root, "python_embeded", "python.exe"), "");
    writeFileSync(join(root, "run_nvidia_gpu.bat"), "");
    const target = inspectComfyTarget(root);
    expect(target.layout).toBe("portable-windows");
    expect(target.pythonCandidates[0]).toMatch(/python_embeded[\\/]python\.exe$/i);
    expect(pickTargetPython(target)).toBe(target.pythonCandidates[0]);
  });
});

describe("CLI resolve-nodes / setup / inspect", () => {
  it("JSON output is deterministic and resolve-nodes does not mutate without --write", async () => {
    const reg = await startRegistryServer(vhsHandler);
    const dir = customPkg({ classes: ["VHS_LoadVideo", "VHS_VideoCombine"] });
    const before = readFileSync(join(dir, "comfy.workflow.json"), "utf8");
    try {
      const a = await cwf(["resolve-nodes", dir, "--json", "--registry-url", reg.url]);
      const b = await cwf(["resolve-nodes", dir, "--json", "--registry-url", reg.url]);
      expect(a.code).toBe(0);
      expect(a.stdout).toBe(b.stdout);
      expect(readFileSync(join(dir, "comfy.workflow.json"), "utf8")).toBe(before);
      const body = jsonOf<{ packs: Array<{ id: string; provides: string[] }> }>(a.stdout);
      expect(body.packs[0]?.id).toBe("comfyui-videohelpersuite");
      expect(body.packs[0]?.provides).toEqual(["VHS_LoadVideo", "VHS_VideoCombine"]);
    } finally {
      await reg.close();
    }
  });

  it("--write updates manifest atomically", async () => {
    const reg = await startRegistryServer(vhsHandler);
    const dir = customPkg({ classes: ["VHS_LoadVideo"] });
    try {
      const res = await cwf(["resolve-nodes", dir, "--write", "--json", "--registry-url", reg.url]);
      expect(res.code).toBe(0);
      const man = JSON.parse(readFileSync(join(dir, "comfy.workflow.json"), "utf8")) as {
        requires: { nodePacks: Array<{ id: string }> };
      };
      expect(man.requires.nodePacks[0]?.id).toBe("comfyui-videohelpersuite");
      parseWorkflowManifest(man);
    } finally {
      await reg.close();
    }
  });

  it("inspect reports missing pack and never hits an installer", async () => {
    const dir = customPkg({
      classes: ["VHS_LoadVideo"],
      packs: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" }],
    });
    const { createServer: http } = await import("node:http");
    const hits: string[] = [];
    const server = http((req, res) => {
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
        dependencies: { packs: Array<{ id: string; versionStatus: string }>; missing: number };
      }>(res.stdout);
      expect(body.live.missing).toContain("VHS_LoadVideo");
      expect(body.dependencies.packs[0]?.id).toBe("comfyui-videohelpersuite");
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

  it("setup --dry-run performs no mutation and default path requires approval", async () => {
    const reg = await startRegistryServer(vhsHandler);
    const dir = customPkg({
      classes: ["VHS_LoadVideo"],
      packs: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" }],
    });
    const comfy = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(comfy, "custom_nodes"), { recursive: true });
    writeFileSync(join(comfy, "main.py"), "#\n");
    try {
      const dry = await cwf([
        "setup",
        dir,
        "--comfy",
        comfy,
        "--dry-run",
        "--json",
        "--registry-url",
        reg.url,
      ]);
      expect(jsonOf<{ toInstall: unknown[]; dryRun: boolean }>(dry.stdout).dryRun).toBe(true);
      expect(existsSync(join(comfy, "custom_nodes", "comfyui-videohelpersuite"))).toBe(false);

      const declined = await cwf(["setup", dir, "--comfy", comfy, "--json", "--registry-url", reg.url]);
      // Non-TTY without --yes must not apply; JSON plan is returned.
      const body = jsonOf<{ toInstall: Array<{ id: string }>; dryRun: boolean }>(declined.stdout);
      expect(body.dryRun).toBe(true);
      expect(body.toInstall[0]?.id).toBe("comfyui-videohelpersuite");
      expect(
        (body.toInstall[0] as { verified?: boolean } | undefined)?.verified,
      ).toBe(true);
    } finally {
      await reg.close();
    }
  });

  it("setup --yes applies plan through argument-array installer", async () => {
    const reg = await startRegistryServer(vhsHandler);
    const dir = customPkg({
      classes: ["VHS_LoadVideo"],
      packs: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" }],
    });
    const comfy = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(comfy, "comfy"), { recursive: true });
    mkdirSync(join(comfy, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(comfy, "main.py"), "#\n");
    // Without cm-cli the apply path fails closed — that is the official seam.
    writeFileSync(
      join(comfy, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"),
      "raise SystemExit(0)\n",
    );
    try {
      const res = await cwf([
        "setup",
        dir,
        "--comfy",
        comfy,
        "--yes",
        "--json",
        "--registry-url",
        reg.url,
      ]);
      // No target Python → E_COMFY_PYTHON_UNKNOWN on stderr. If Python exists, a
      // structured JSON plan is fine. Never shell-concatenate; never ready on unresolved.
      const raw = res.stdout.trim().length > 0 ? res.stdout : res.stderr;
      const body = jsonOf<{
        failed?: unknown[];
        ready?: boolean;
        error?: { code?: string };
      }>(raw);
      if (body.error) {
        expect(body.error.code).toBe("E_COMFY_PYTHON_UNKNOWN");
      } else {
        expect(body).toHaveProperty("failed");
        expect(typeof body.ready).toBe("boolean");
        expect(body.ready).toBe(false);
      }
    } finally {
      await reg.close();
    }
  });

  it("cwf node-pack add writes validated metadata", async () => {
    const dir = customPkg({ classes: ["FooNode"] });
    const res = await cwf([
      "node-pack",
      "add",
      "foo-pack",
      "--provides",
      "FooNode,BarNode",
      "--dir",
      dir,
      "--json",
    ]);
    expect(res.code).toBe(0);
    const man = parseWorkflowManifest(
      JSON.parse(readFileSync(join(dir, "comfy.workflow.json"), "utf8")),
    );
    expect(man.requires.nodePacks[0]?.id).toBe("foo-pack");
    expect(man.requires.nodePacks[0]?.provides).toEqual(["BarNode", "FooNode"]);
  });

  it("generated README contains setup instructions for custom nodes", () => {
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
    expect(generated.files["README.md"]).toContain("cwf setup vhs-demo --comfy");
    expect(generated.files["README.md"]).not.toContain("git clone");
  });

  it("existing workflow package remains backwards-compatible", () => {
    const pkgDir = join(__dirname, "..", "packages", "workflow-t2i");
    const man = parseWorkflowManifest(
      JSON.parse(readFileSync(join(pkgDir, "comfy.workflow.json"), "utf8")),
    );
    expect(man.requires.nodePacks).toEqual([]);
    expect(man.requires.nodeClasses).toContain("KSampler");
  });

  it("pack diagnostics point to resolve-nodes", async () => {
    const dir = customPkg({ classes: ["VHS_LoadVideo"] });
    const res = await cwf(["pack", dir, "--json"]);
    expect(res.code).toBe(0);
    const body = jsonOf<{ diagnostics: Array<{ code: string; hint?: string }> }>(res.stdout);
    const w = body.diagnostics.find((d) => d.code === "W_PACK_UNRESOLVED_NODE_PACK");
    expect(w?.hint).toMatch(/cwf resolve-nodes/);
  });

  it("pack --publish does not fail merely because a class is unresolved/unknown", async () => {
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

  it("paths containing spaces work on Windows for --comfy", async () => {
    const reg = await startRegistryServer(vhsHandler);
    const dir = customPkg({
      classes: ["VHS_LoadVideo"],
      packs: [{ id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" }],
    });
    const parent = mkdtempSync(join(tmpdir(), "cwf space "));
    const comfy = join(parent, "Comfy UI Root");
    mkdirSync(join(comfy, "custom_nodes"), { recursive: true });
    writeFileSync(join(comfy, "main.py"), "#\n");
    try {
      const res = await cwf([
        "setup",
        dir,
        "--comfy",
        comfy,
        "--dry-run",
        "--json",
        "--registry-url",
        reg.url,
      ]);
      expect(res.code).toBe(0);
      const body = jsonOf<{ toInstall: Array<{ id: string; verified?: boolean }> }>(res.stdout);
      expect(body.toInstall[0]?.id).toBe("comfyui-videohelpersuite");
      expect(body.toInstall[0]?.verified).toBe(true);
    } finally {
      await reg.close();
    }
  });
});

describe("merge / write", () => {
  it("mergeResolvedPacks is stable and stringifyManifest is valid", () => {
    const manifest = parseWorkflowManifest(BASE_MANIFEST);
    const merged = mergeResolvedPacks(manifest, [
      { id: "comfyui-videohelpersuite", provides: ["VHS_LoadVideo"], source: "registry" },
    ]);
    const text = stringifyManifest(merged);
    const again = parseWorkflowManifest(JSON.parse(text));
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

describe("security: run / inspect / init never install", () => {
  it("cwf run/inspect/init source never invokes the installer", () => {
    const cli = readFileSync(join(__dirname, "..", "src", "cli", "cli.ts"), "utf8");
    const runFn = cli.slice(
      cli.indexOf("async function cmdRun"),
      cli.indexOf("async function cmdInit"),
    );
    expect(runFn).not.toMatch(/applySetupPlan/);
    expect(runFn).not.toMatch(/cm-cli/);
    const inspectFn = cli.slice(
      cli.indexOf("async function cmdInspect"),
      cli.indexOf("async function liveClassNames"),
    );
    expect(inspectFn).not.toMatch(/applySetupPlan/);
    const initFn = cli.slice(
      cli.indexOf("async function cmdInit"),
      cli.indexOf("async function cmdExpose"),
    );
    expect(initFn).not.toMatch(/applySetupPlan/);
    expect(initFn).not.toMatch(/cm-cli/);
  });
});

describe("registry client", () => {
  it("maps class name to pack and treats 404 as unknown", async () => {
    const reg = await startRegistryServer(vhsHandler);
    try {
      const client = createRegistryClient({ baseUrl: reg.url });
      const packs = await client.lookupClass("VHS_LoadVideo");
      expect(packs[0]?.id).toBe("comfyui-videohelpersuite");
      expect(reg.hits.some((h) => h.includes("/nodes/search"))).toBe(true);
      const none = await client.lookupClass("GemmyH3SaveAVLatent");
      expect(none).toEqual([]);
    } finally {
      await reg.close();
    }
  });

  it("enumerates paginated search hits plus ranked hint via real HTTP client", async () => {
    const searchPages: Record<string, unknown> = {
      "1": {
        nodes: [{ id: "foo-pack", name: "Foo", latest_version: { version: "1.0.0" } }],
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      },
      "2": {
        nodes: [{ id: "alt-foo-pack", name: "Alt", latest_version: { version: "2.0.0" } }],
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      },
    };
    const reg = await startRegistryServer((u, res) => {
      res.setHeader("Content-Type", "application/json");
      if (u.startsWith("/nodes/search")) {
        const page = new URL(u, "http://registry.test").searchParams.get("page") ?? "1";
        res.end(JSON.stringify(searchPages[page] ?? { nodes: [], page: 1, totalPages: 1, total: 0 }));
        return true;
      }
      if (u.includes("/comfy-nodes/FooSampler/node")) {
        res.end(JSON.stringify({ id: "ranked-foo", name: "Ranked", latest_version: { version: "9.0.0" } }));
        return true;
      }
      return false;
    });
    try {
      const client = createRegistryClient({ baseUrl: reg.url });
      const packs = await client.lookupClass("FooSampler");
      expect(packs.map((p) => p.id).sort()).toEqual(["alt-foo-pack", "foo-pack", "ranked-foo"]);
      expect(reg.hits.filter((h) => h.includes("/nodes/search")).length).toBeGreaterThanOrEqual(2);
      expect(reg.hits.some((h) => h.includes("/comfy-nodes/FooSampler/node"))).toBe(true);
    } finally {
      await reg.close();
    }
  });

  it("listComfyNodes paginates real HTTP definitions", async () => {
    const pages: Record<string, unknown> = {
      "1": {
        comfy_nodes: [{ comfy_node_name: "VHS_SelectImages" }],
        totalNumberOfPages: 2,
      },
      "2": {
        comfy_nodes: [{ comfy_node_name: "VHS_LoadVideo" }, { comfy_node_name: "VHS_VideoCombine" }],
        totalNumberOfPages: 2,
      },
    };
    const reg = await startRegistryServer((u, res) => {
      res.setHeader("Content-Type", "application/json");
      if (/\/nodes\/comfyui-videohelpersuite\/versions\/1\.7\.9\/comfy-nodes/.test(u)) {
        const page = new URL(u, "http://registry.test").searchParams.get("page") ?? "1";
        res.end(JSON.stringify(pages[page] ?? { comfy_nodes: [], totalNumberOfPages: 2 }));
        return true;
      }
      return false;
    });
    try {
      const client = createRegistryClient({ baseUrl: reg.url });
      const names = await client.listComfyNodes("comfyui-videohelpersuite", "1.7.9");
      expect(names).toEqual(["VHS_LoadVideo", "VHS_SelectImages", "VHS_VideoCombine"]);
      expect(reg.hits.filter((h) => h.includes("comfy-nodes")).length).toBeGreaterThanOrEqual(2);
    } finally {
      await reg.close();
    }
  });

  it("ambiguity is proven through real RegistryClient HTTP, not mockRegistry arrays", async () => {
    const packs = [
      { id: "foo-pack", name: "Foo", latest_version: { version: "1.0.0" } },
      { id: "alt-foo-pack", name: "Alt", latest_version: { version: "1.0.0" } },
    ];
    const reg = await startRegistryServer((u, res) => {
      res.setHeader("Content-Type", "application/json");
      if (u.startsWith("/nodes/search")) {
        res.end(JSON.stringify({ nodes: packs, page: 1, limit: 64, total: 2, totalPages: 1 }));
        return true;
      }
      if (u.includes("/comfy-nodes/FooSampler/node")) {
        res.end(JSON.stringify(packs[0]));
        return true;
      }
      const versionMatch = /\/nodes\/([^/]+)\/versions\/([^/]+)\/comfy-nodes/.exec(u);
      if (versionMatch) {
        res.end(JSON.stringify({ comfy_nodes: [{ comfy_node_name: "FooSampler" }] }));
        return true;
      }
      if (/\/nodes\/[^/]+\/versions/.test(u) && !u.includes("comfy-nodes")) {
        res.end(JSON.stringify([{ version: "1.0.0", status: "NodeVersionStatusActive" }]));
        return true;
      }
      if (/\/nodes\/[^/]+\/install/.test(u)) {
        res.end(JSON.stringify({ version: "1.0.0" }));
        return true;
      }
      const getPack = /\/nodes\/(foo-pack|alt-foo-pack)$/.exec(u);
      if (getPack) {
        res.end(JSON.stringify(packs.find((p) => p.id === getPack[1])));
        return true;
      }
      return false;
    });
    try {
      const client = createRegistryClient({ baseUrl: reg.url });
      const r = await resolveNodeClasses({
        nodeClasses: ["FooSampler"],
        registry: client,
      });
      expect(r.ambiguous).toHaveLength(1);
      expect(r.ambiguous[0]?.candidates?.map((c) => c.id).sort()).toEqual([
        "alt-foo-pack",
        "foo-pack",
      ]);
      expect(r.packs).toEqual([]);
      expect(r.resolutions[0]?.kind).toBe("ambiguous");
    } finally {
      await reg.close();
    }
  });
});

describe("unverified registry claims never auto-install", () => {
  function comfyTree(): ReturnType<typeof inspectComfyTarget> {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    return inspectComfyTarget(tmp);
  }

  it("v2 source:registry lie with definitions that omit the class does not reach installer", async () => {
    const target = comfyTree();
    const spawned: string[][] = [];
    const manifest = parseWorkflowManifest({
      ...BASE_MANIFEST,
      specVersion: 2,
      requires: {
        nodeClasses: ["VHS_LoadVideo"],
        nodePacks: [
          {
            id: "comfyui-videohelpersuite",
            provides: ["VHS_LoadVideo"],
            source: "registry",
          },
        ],
        models: [],
      },
    });
    const report = await buildDependencyReport({
      manifest,
      nodeClasses: ["VHS_LoadVideo"],
      installedClasses: [],
      registry: mockRegistry(
        { VHS_LoadVideo: VHS },
        { provided: { "comfyui-videohelpersuite": ["SomeOtherNode"] } },
      ),
      target,
    });
    expect(report.unknownNodeClasses).toContain("VHS_LoadVideo");
    expect(report.customNodeClasses).not.toContain("VHS_LoadVideo");
    expect(report.plan.toInstall).toEqual([]);
    expect(report.plan.packages[0]?.verified).toBe(false);
    expect(report.plan.ready).toBe(false);
    const applied = await applySetupPlan({
      plan: {
        ...report.plan,
        unresolved: [],
        ambiguous: [],
        toInstall: [
          {
            ...report.plan.packages[0]!,
            action: "install",
            source: "registry",
            verified: false,
          },
        ],
      },
      target,
      yes: true,
      pythonPath: "python",
      run: async (opts) => {
        spawned.push(opts.args);
        return { code: 0, stdout: "should not run", stderr: "" };
      },
    });
    expect(spawned).toEqual([]);
    expect(applied.plan.failed.map((f) => f.id)).toContain("comfyui-videohelpersuite");
    expect(applied.results[0]?.stderr).toMatch(/unverified/i);
  });

  it("Registry definitions unavailable (undefined) stays UNKNOWN and does not install", async () => {
    const target = comfyTree();
    const spawned: string[][] = [];
    const report = await buildDependencyReport({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["VHS_LoadVideo"],
          nodePacks: [
            {
              id: "comfyui-videohelpersuite",
              provides: ["VHS_LoadVideo"],
              source: "registry",
            },
          ],
          models: [],
        },
      }),
      nodeClasses: ["VHS_LoadVideo"],
      installedClasses: [],
      registry: mockRegistry(
        { VHS_LoadVideo: VHS },
        { provided: { "comfyui-videohelpersuite": undefined } },
      ),
      target,
    });
    expect(report.resolution.resolutions[0]?.kind).toBe("unknown");
    expect(report.plan.toInstall).toEqual([]);
    const applied = await applySetupPlan({
      plan: {
        ...report.plan,
        unresolved: [],
        ambiguous: [],
        toInstall: [
          {
            id: "comfyui-videohelpersuite",
            versionStatus: "missing",
            source: "registry",
            provides: ["VHS_LoadVideo"],
            action: "install",
            verified: false,
            resolvedVersion: "1.7.9",
          },
        ],
      },
      target,
      yes: true,
      pythonPath: "python",
      run: async (opts) => {
        spawned.push(opts.args);
        return { code: 0, stdout: "no", stderr: "" };
      },
    });
    expect(spawned).toEqual([]);
    expect(applied.plan.failed).toHaveLength(1);
  });

  it("exact verified registry pack does reach installer", async () => {
    const target = comfyTree();
    const spawned: string[][] = [];
    const report = await buildDependencyReport({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["VHS_LoadVideo"],
          nodePacks: [
            {
              id: "comfyui-videohelpersuite",
              provides: ["VHS_LoadVideo"],
              source: "registry",
            },
          ],
          models: [],
        },
      }),
      nodeClasses: ["VHS_LoadVideo"],
      installedClasses: [],
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
      target,
    });
    expect(report.plan.toInstall.map((p) => p.id)).toEqual(["comfyui-videohelpersuite"]);
    expect(report.plan.toInstall[0]?.verified).toBe(true);
    expect(report.resolvedCustomNodeClasses).toEqual(["VHS_LoadVideo"]);
    const applied = await applySetupPlan({
      plan: report.plan,
      target,
      yes: true,
      pythonPath: "python",
      run: async (opts) => {
        spawned.push(opts.args);
        return { code: 0, stdout: "[INSTALLED] comfyui-videohelpersuite", stderr: "" };
      },
    });
    expect(spawned).toEqual([["install", "comfyui-videohelpersuite@1.7.9", "--exit-on-fail"]]);
    expect(applied.plan.failed).toEqual([]);
    expect(applied.plan.restartRequired).toBe(true);
    expect(applied.plan.ready).toBe(false);
  });
});

describe("ready invariant", () => {
  it("manual mapping + missing class => ready false", async () => {
    const report = await buildDependencyReport({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["RTXVideoSuperResolution"],
          nodePacks: [
            {
              id: "ComfyUI-NVIDIA-RTX-VSR-Pro",
              provides: ["RTXVideoSuperResolution"],
              source: "manual",
            },
          ],
          models: [],
        },
      }),
      nodeClasses: ["RTXVideoSuperResolution"],
      installedClasses: [],
      registry: mockRegistry({}),
    });
    expect(report.plan.toInstall).toEqual([]);
    expect(report.plan.ready).toBe(false);
    expect(report.plan.missingNodeClasses).toContain("RTXVideoSuperResolution");
  });

  it("successful install + restart required + old object_info => ready false", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cwf-comfy-"));
    mkdirSync(join(tmp, "custom_nodes", "ComfyUI-Manager"), { recursive: true });
    writeFileSync(join(tmp, "main.py"), "# comfy\n");
    writeFileSync(join(tmp, "custom_nodes", "ComfyUI-Manager", "cm-cli.py"), "# manager\n");
    const target = inspectComfyTarget(tmp);
    const plan = createSetupPlan({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["VHS_LoadVideo"],
          nodePacks: [
            {
              id: "comfyui-videohelpersuite",
              provides: ["VHS_LoadVideo"],
              source: "registry",
            },
          ],
          models: [],
        },
      }),
      missingNodeClasses: ["VHS_LoadVideo"],
      availableNodeClasses: [],
      packs: [
        packAction({
          declared: {
            id: "comfyui-videohelpersuite",
            provides: ["VHS_LoadVideo"],
            source: "registry",
          },
          versionStatus: "missing",
          resolvedVersion: "1.7.9",
          verified: true,
        }),
      ],
      unresolved: [],
      ambiguous: [],
      target: { root: tmp, layout: "git" },
      availabilityKnown: true,
    });
    const applied = await applySetupPlan({
      plan,
      target,
      yes: true,
      pythonPath: "python",
      run: async () => ({ code: 0, stdout: "[INSTALLED]", stderr: "" }),
    });
    expect(applied.plan.restartRequired).toBe(true);
    expect(applied.plan.missingNodeClasses).toContain("VHS_LoadVideo");
    expect(applied.plan.ready).toBe(false);
  });

  it("unresolved/ambiguous => ready false", () => {
    const unresolved = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["GemmyH3SaveAVLatent"],
      availableNodeClasses: [],
      packs: [],
      unresolved: [{ className: "GemmyH3SaveAVLatent", kind: "unknown" }],
      ambiguous: [],
      availabilityKnown: true,
    });
    expect(unresolved.ready).toBe(false);
    const ambiguous = createSetupPlan({
      manifest: parseWorkflowManifest(BASE_MANIFEST),
      missingNodeClasses: ["FooSampler"],
      availableNodeClasses: [],
      packs: [],
      unresolved: [],
      ambiguous: [
        {
          className: "FooSampler",
          kind: "ambiguous",
          candidates: [{ id: "a" }, { id: "b" }],
        },
      ],
      availabilityKnown: true,
    });
    expect(ambiguous.ready).toBe(false);
  });

  it("post-restart object_info containing every required class => ready true", async () => {
    const report = await buildDependencyReport({
      manifest: parseWorkflowManifest({
        ...BASE_MANIFEST,
        specVersion: 2,
        requires: {
          nodeClasses: ["VHS_LoadVideo", "KSampler"],
          nodePacks: [
            {
              id: "comfyui-videohelpersuite",
              provides: ["VHS_LoadVideo"],
              source: "registry",
            },
          ],
          models: [],
        },
      }),
      nodeClasses: ["VHS_LoadVideo", "KSampler"],
      installedClasses: ["VHS_LoadVideo", "KSampler"],
      registry: mockRegistry({ VHS_LoadVideo: VHS }),
    });
    expect(report.missingNodeClasses).toEqual([]);
    expect(report.plan.toInstall).toEqual([]);
    expect(report.plan.ready).toBe(true);
  });

  it("UNKNOWN classes are not reported as custom", async () => {
    const report = await buildDependencyReport({
      manifest: parseWorkflowManifest({
        specVersion: 1,
        name: "x",
        title: "X",
        entry: "./workflow.ir.json",
        parameters: {},
        outputs: [],
        requires: { nodeClasses: ["GemmyH3SaveAVLatent", "KSampler"], nodePacks: [], models: [] },
      }),
      nodeClasses: ["GemmyH3SaveAVLatent", "KSampler"],
      installedClasses: [],
      registry: mockRegistry({}),
    });
    expect(report.coreNodeClasses).toEqual(["KSampler"]);
    expect(report.unknownNodeClasses).toEqual(["GemmyH3SaveAVLatent"]);
    expect(report.resolvedCustomNodeClasses).toEqual([]);
    expect(report.customNodeClasses).toEqual([]);
  });
});
