import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { join } from "node:path";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { compile } from "../compile/index.js";
import { loadDefsSnapshot } from "../defs/snapshot.js";
import { hashObjectInfo, parseObjectInfo } from "../defs/parse.js";
import type { NodeDefs } from "../defs/types.js";
import { emitTs } from "../emit-ts/emit.js";
import { generateNodeModules } from "../codegen/codegen.js";
import { importComfyJson } from "../import/index.js";
import { parseGraph, serializeGraph } from "../ir/serialize.js";
import type { Graph } from "../ir/types.js";
import { instantiateTemplate } from "../ir/template.js";
import { createClient } from "../runtime/client.js";
import { captureLock, writeLock, readLockAt, lockDrift, type NodePackInfo } from "../lock/lock.js";
import { explainGraph } from "../recipes/explain.js";
import { isComfyError } from "../errors.js";
import type { EmitterRegistry } from "../emit-ts/emit.js";
import { parseJsonLossless } from "../lossless-parse.js";

/**
 * `comfy` CLI — the scriptable surface for agents:
 *   import | snapshot | lock | codegen | compile | validate | run | catalog | explain
 *
 * Failures print machine-readable JSON errors to stderr and exit non-zero.
 */

const dirOfThis = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(dirOfThis, "..", "..");

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  // Short → long aliases. Documented CLI surface uses these short forms.
  const SHORT_ALIASES: Record<string, string> = {
    o: "out",
    u: "url",
    d: "defs",
    p: "param",
    t: "ts",
    f: "from",
    F: "format",
  };
  const isFlagToken = (s: string | undefined): boolean => s !== undefined && s.startsWith("-");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--param" || a === "-p") {
      const list = (flags["param"] as string[]) ?? [];
      list.push(argv[++i] ?? "");
      flags["param"] = list;
    } else if (a.startsWith("--")) {
      const key = SHORT_ALIASES[a.slice(2)] ?? a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !isFlagToken(next)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const raw = a.slice(1);
      const key = SHORT_ALIASES[raw] ?? raw;
      const next = argv[i + 1];
      if (next !== undefined && !isFlagToken(next)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function flag(flags: Record<string, string | boolean | string[]>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagList(
  flags: Record<string, string | boolean | string[]>,
  key: string,
): string[] | undefined {
  const v = flags[key];
  return Array.isArray(v) ? v : undefined;
}

export async function cli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  try {
    switch (command) {
      case "import":
        return await cmdImport(positional, flags);
      case "snapshot":
        return await cmdSnapshot(flags);
      case "lock":
        return await cmdLock(flags);
      case "codegen":
        return await cmdCodegen(flags);
      case "compile":
        return await cmdCompile(positional, flags);
      case "validate":
        return await cmdValidate(positional, flags);
      case "run":
        return await cmdRun(positional, flags);
      case "catalog":
        return await cmdCatalog(positional, flags);
      case "explain":
        return await cmdExplain(positional, flags);
      default:
        printHelp();
        return command === undefined ? 0 : 1;
    }
  } catch (e) {
    const err = isComfyError(e)
      ? e.toJSON()
      : { code: "E_UNCAUGHT", message: String(e instanceof Error ? (e.stack ?? e.message) : e) };
    process.stderr.write(JSON.stringify({ error: err }, null, 2) + "\n");
    return 1;
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      "comfy — code-first ComfyUI workflow system",
      "",
      "  comfy import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]",
      "  comfy snapshot --url URL -o object_info.json",
      "  comfy lock --url URL [-o comfy.lock.json]",
      "  comfy codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]",
      "  comfy compile <workflow.ts | graph.ir.json> [-o out.api.json] [--defs defs.json] [--pretty]",
      "  comfy validate <file> [--url URL] [--defs defs.json]",
      "  comfy run <file> --url URL [--param k=v ...] [--out outdir]",
      "  comfy explain <file | workflow.ts>   # what does this expand into?",
      "  comfy catalog [query] [--from catalog.json]",
      "",
    ].join("\n"),
  );
}

/* ------------------------------------------------------------------ */
/* Shared plumbing                                                     */
/* ------------------------------------------------------------------ */

/** Load defs (plus their objectInfoHash) from comfy-node-defs JSON, a wrapped snapshot, or bare object_info. */
async function loadDefsAny(defsPath: string | undefined): Promise<NodeDefs> {
  return (await loadDefsSources(defsPath)).defs;
}

async function loadDefsSources(
  defsPath: string | undefined,
): Promise<{ defs: NodeDefs; objectInfoHash?: string }> {
  if (defsPath === undefined) return bundledDefsWithHash();
  const json = JSON.parse(await readFile(defsPath, "utf8")) as Record<string, unknown>;
  if (json["format"] === "comfy-node-defs" && json["defs"] !== undefined) {
    return {
      defs: json["defs"] as NodeDefs,
      objectInfoHash:
        typeof json["objectInfoHash"] === "string"
          ? json["objectInfoHash"]
          : hashObjectInfo(json["defs"]),
    };
  }
  const snapshot = await loadDefsSnapshot(defsPath);
  return { defs: snapshot.defs, objectInfoHash: snapshot.objectInfoHash };
}

// Bundled at build time — works both from src (jiti) and dist (published CLI).
import bundledDefsJson from "../nodes/gen/defs.json" with { type: "json" };
function bundledDefsWithHash(): { defs: NodeDefs; objectInfoHash?: string } {
  const gen = bundledDefsJson as { defs?: NodeDefs; objectInfoHash?: string };
  if (!gen?.defs) {
    throw new Error(
      "Bundled node defs missing — run `comfy codegen` in your project and pass --defs <path>.",
    );
  }
  return { defs: gen.defs, objectInfoHash: gen.objectInfoHash };
}

/**
 * Lock drift check: compare the defs in use against a comfy.lock.json.
 * Report-only — a mismatch is a warning, never a hard failure, because the
 * server is the authority on what it can actually run.
 */
async function warnLockDrift(
  defsSources: { objectInfoHash?: string },
  lockPath: string | undefined,
  context: { defsUrl?: string; client?: ReturnType<typeof createClient> },
): Promise<void> {
  const resolved = lockPath ?? ((await exists("comfy.lock.json")) ? "comfy.lock.json" : undefined);
  if (resolved === undefined) return;
  const lock = await readLockAt(resolved);
  if (lock === undefined) return;
  let liveHash = defsSources.objectInfoHash;
  if (context.defsUrl !== undefined && context.client !== undefined) {
    // Prefer the live universe when a server is in the loop.
    const live = await context.client.objectInfo().catch(() => undefined);
    if (live !== undefined) liveHash = hashObjectInfo(live);
  }
  if (liveHash === undefined) return;
  const drift = lockDrift(lock, liveHash);
  if (drift !== undefined) {
    process.stderr.write(
      JSON.stringify({ warning: "E_LOCK_DRIFT", message: drift, lock: resolved }) + "\n",
    );
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function graphFromInput(
  inputPath: string,
  params: Record<string, unknown>,
  defs?: NodeDefs,
): Promise<Graph> {
  if (inputPath.endsWith(".ts") || inputPath.endsWith(".mts")) {
    const jiti = createJiti(import.meta.url, { alias: sdkAliases() });
    const mod = (await jiti.import(path.resolve(inputPath))) as {
      build?: () => unknown;
      default?: () => unknown;
    };
    const build = mod.build ?? mod.default;
    if (typeof build !== "function") {
      throw new Error(`${inputPath} must export build() (or default) returning a Graph`);
    }
    const built = build() as Graph;
    if (Object.keys(params).length > 0 || hasPlaceholders(built)) {
      return instantiateTemplate(built, { params: params as never });
    }
    return built;
  }
  // JSON input: accept IR documents AND Comfy workflow JSON (editor/API format).
  const text = await readFile(inputPath, "utf8");
  let graph: Graph;
  if (looksLikeIr(text)) {
    graph = parseGraph(text);
  } else {
    // Lossless parse: workflow JSON may contain integers beyond JS's safe
    // range (e.g. 2^64−1 seeds); JSON.parse would silently corrupt them.
    graph = importComfyJson(parseJsonLossless(text), defs).graph;
  }
  if (Object.keys(params).length > 0 || hasPlaceholders(graph)) {
    graph = instantiateTemplate(graph, { params: params as never });
  }
  return graph;
}

/** IR documents carry irVersion; anything else is treated as Comfy workflow JSON. */
function looksLikeIr(text: string): boolean {
  return /"irVersion"\s*:/.test(text);
}

/** Alias map so `import … from "comfy-sdk…"` resolves inside this repo (dev: src, published: dist). */
function sdkAliases(): Record<string, string> {
  const base = existsSync(path.join(PKG_ROOT, "dist", "index.js"))
    ? path.join(PKG_ROOT, "dist")
    : path.join(PKG_ROOT, "src");
  const ext = existsSync(path.join(PKG_ROOT, "dist", "index.js")) ? "js" : "ts";
  return {
    "comfy-sdk/nodes": path.join(base, "nodes", `index.${ext}`),
    "comfy-sdk/runtime": path.join(base, "runtime", `index.${ext}`),
    "comfy-sdk/ir": path.join(base, "ir", `index.${ext}`),
    "comfy-sdk": path.join(base, `index.${ext}`),
  };
}

function existsSync(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").existsSync(p);
  } catch {
    return false;
  }
}

function hasPlaceholders(g: Graph): boolean {
  return Object.values(g.nodes).some((n) =>
    Object.values(n.params).some(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        !Array.isArray(v) &&
        "$param" in (v as unknown as Record<string, unknown>),
    ),
  );
}

function parseParams(list: string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of list ?? []) {
    const eq = kv.indexOf("=");
    if (eq <= 0) throw new Error(`Bad --param (expected key=value): ${kv}`);
    const key = kv.slice(0, eq);
    const raw = kv.slice(eq + 1);
    if (/^-?\d+n$/.test(raw)) out[key] = BigInt(raw.slice(0, -1));
    else if (/^-?\d+$/.test(raw)) {
      // Integers parse losslessly (BigInt) so CLI params never lose precision.
      const v = BigInt(raw);
      out[key] =
        v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(-Number.MAX_SAFE_INTEGER)
          ? Number(v)
          : v;
    } else {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function cmdImport(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const file = positional[0];
  if (file === undefined)
    throw new Error(
      "Usage: comfy import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]",
    );
  const defs = await loadDefsAny(flag(flags, "from"));
  // Lossless parse: workflow JSON may contain integers beyond JS's safe range
  // (e.g. 2^64−1 seeds); JSON.parse would silently corrupt them.
  const raw = parseJsonLossless(await readFile(file, "utf8"));
  const { graph, diagnostics } = importComfyJson(raw, defs);
  const outPath = flag(flags, "out") ?? file.replace(/\.json$/i, ".ir.json");
  await writeFile(outPath, serializeGraph(graph, { pretty: true }), "utf8");
  const summary: Record<string, unknown> = {
    ok: true,
    ir: outPath,
    nodes: Object.keys(graph.nodes).length,
    outputs: graph.outputs.length,
    diagnostics,
  };
  if (flag(flags, "ts") !== undefined) {
    const tsPath = flag(flags, "ts") as string;
    await mkdir(path.dirname(path.resolve(tsPath)), { recursive: true });
    // --registry <codegenDir>: route nodes to a generated custom-node registry
    // (the output of `comfy codegen -o <dir>`), so emitted workflow.ts imports
    // resolve even for classes absent from the SDK's built-in registry.
    let registries: EmitterRegistry[] | undefined;
    const registryDir = flag(flags, "registry");
    if (registryDir !== undefined) {
      const registryDefsPath = join(registryDir, "defs.json");
      const json = JSON.parse(await readFile(registryDefsPath, "utf8")) as {
        defs?: NodeDefs;
      };
      const classes = new Set(Object.keys(json.defs ?? {}));
      const rel = path
        .relative(path.dirname(path.resolve(tsPath)), join(registryDir, "registry.js"))
        .replaceAll("\\", "/");
      const specifier = rel.startsWith(".") ? rel : `./${rel}`;
      registries = [{ specifier, classes }];
      summary["registry"] = specifier;
    }
    await writeFile(tsPath, emitTs(graph, { defs, registries: registries as never }), "utf8");
    summary["ts"] = tsPath;
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return 0;
}

async function cmdSnapshot(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const url = flag(flags, "url");
  const out = flag(flags, "out");
  if (url === undefined || out === undefined)
    throw new Error("Usage: comfy snapshot --url URL -o object_info.json");
  const client = createClient({ url });
  const objectInfo = await client.objectInfo();
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  const { saveDefsSnapshot } = await import("../defs/snapshot.js");
  const hash = await saveDefsSnapshot(out, objectInfo as never, { source: url });
  process.stdout.write(
    JSON.stringify({
      ok: true,
      out,
      objectInfoHash: hash,
      classes: Object.keys(objectInfo).length,
    }) + "\n",
  );
  return 0;
}

async function cmdLock(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const url = flag(flags, "url");
  if (url === undefined) throw new Error("Usage: comfy lock --url URL [-o comfy.lock.json]");
  const client = createClient({ url });
  const [objectInfo, systemStats] = [
    await client.objectInfo(),
    await client.systemStats().catch(() => undefined),
  ];
  const nodePacks = await fetchNodePacks(url);
  const lock = await captureLock({ objectInfo, systemStats, nodePacks });
  const out = flag(flags, "out") ?? "comfy.lock.json";
  // Honor the exact requested path (the lock format lives in the file itself).
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, JSON.stringify(lock, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ ok: true, out, lock }, null, 2) + "\n");
  return 0;
}

async function fetchNodePacks(baseUrl: string): Promise<Record<string, NodePackInfo>> {
  for (const p of ["/manager/customnode/getlist", "/customnode/getlist"]) {
    try {
      const res = await fetch(`${baseUrl}${p}`);
      if (!res.ok) continue;
      const body = (await res.json()) as {
        nodepacks?: Array<{ name?: string; cnr_version?: string; version?: string }>;
      };
      const packs: Record<string, NodePackInfo> = {};
      for (const np of body.nodepacks ?? []) {
        if (typeof np.name === "string") packs[np.name] = { version: np.version ?? np.cnr_version };
      }
      return packs;
    } catch {
      continue;
    }
  }
  return {};
}

async function cmdCodegen(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const out = flag(flags, "out");
  if (out === undefined)
    throw new Error(
      "Usage: comfy codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]",
    );
  const exactCombos = flags["exact-combos"] === true;
  const url = flag(flags, "url");
  const from = flag(flags, "from");
  if (url !== undefined) {
    const client = createClient({ url });
    const raw = await client.objectInfo();
    const hash = hashObjectInfo(raw);
    const result = generateNodeModules({
      defs: parseObjectInfo(raw as never),
      objectInfoHash: hash,
      exactCombos,
      importsFrom: "comfy-sdk",
    });
    await writeGenerated(out, result.files);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        out,
        files: result.files.map((f) => f.path),
        objectInfoHash: hash,
      }) + "\n",
    );
    return 0;
  }
  if (from !== undefined) {
    const snapshot = await loadDefsSnapshot(from);
    const result = generateNodeModules({
      defs: snapshot.defs,
      objectInfoHash: snapshot.objectInfoHash,
      exactCombos,
      importsFrom: "comfy-sdk",
    });
    await writeGenerated(out, result.files);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        out,
        files: result.files.map((f) => f.path),
        objectInfoHash: snapshot.objectInfoHash,
      }) + "\n",
    );
    return 0;
  }
  throw new Error("Usage: comfy codegen [--url URL | --from snapshot.json] -o src/nodes/gen");
}

async function writeGenerated(
  out: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  await mkdir(out, { recursive: true });
  for (const f of files) await writeFile(path.join(out, f.path), f.content, "utf8");
}

async function cmdCompile(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined)
    throw new Error(
      "Usage: comfy compile <workflow.ts | graph.ir.json> [-o out.api.json] [--lock comfy.lock.json]",
    );
  const defsSources = await loadDefsSources(flag(flags, "defs"));
  const defs = defsSources.defs;
  const graph = await graphFromInput(input, parseParams(flagList(flags, "param")), defs);
  await warnLockDrift(defsSources, flag(flags, "lock"), {});
  const result = compile(graph, defs, { pretty: flags["pretty"] === true });
  if (!result.ok) {
    process.stderr.write(
      JSON.stringify(
        {
          ok: false,
          errors: result.errors.map((e) => e.toJSON()),
          warnings: result.warnings.map((e) => e.toJSON()),
        },
        null,
        2,
      ) + "\n",
    );
    return 1;
  }
  const outPath = flag(flags, "out");
  if (outPath !== undefined) {
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, result.json + "\n", "utf8");
  } else {
    process.stdout.write(result.json + "\n");
  }
  process.stderr.write(
    JSON.stringify(
      {
        ok: true,
        hash: result.hash,
        nodes: Object.keys(result.object).length,
        warnings: result.warnings.length,
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

async function cmdValidate(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined)
    throw new Error(
      "Usage: comfy validate <file> [--url URL] [--defs defs.json] [--lock comfy.lock.json]",
    );
  const defsSources = await loadDefsSources(flag(flags, "defs"));
  const defs = defsSources.defs;
  const graph = await graphFromInput(input, parseParams(flagList(flags, "param")), defs);
  const result = compile(graph, defs);
  const errorJson = () => (result.ok ? [] : result.errors.map((e) => e.toJSON()));
  const warningJson = () => result.warnings.map((e) => e.toJSON());
  const url = flag(flags, "url");
  if (url !== undefined) {
    const client = createClient({ url });
    await warnLockDrift(defsSources, flag(flags, "lock"), { defsUrl: url, client });
    const server = await client.validate({ kind: "graph", graph });
    process.stdout.write(
      JSON.stringify(
        {
          ok: result.ok && server.ok,
          local: { errors: errorJson(), warnings: warningJson() },
          server: server.serverResponse ?? null,
        },
        null,
        2,
      ) + "\n",
    );
    return result.ok && server.ok ? 0 : 1;
  }
  process.stdout.write(
    JSON.stringify({ ok: result.ok, errors: errorJson(), warnings: warningJson() }, null, 2) + "\n",
  );
  return result.ok ? 0 : 1;
}

async function cmdRun(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  const url = flag(flags, "url");
  if (input === undefined || url === undefined) {
    throw new Error(
      "Usage: comfy run <file> --url URL [--param k=v ...] [--out outdir] [--defs defs.json] [--lock comfy.lock.json]",
    );
  }
  const defsSources = await loadDefsSources(flag(flags, "defs"));
  const client = createClient({ url });
  await warnLockDrift(defsSources, flag(flags, "lock"), { defsUrl: url, client });
  const graph = await graphFromInput(
    input,
    parseParams(flagList(flags, "param")),
    defsSources.defs,
  );
  const result = await client.run(
    { kind: "graph", graph },
    {
      outDir: flag(flags, "out"),
      defs: defsSources.defs,
      onEvent: (e) => {
        if (e.type === "progress" && process.stderr.isTTY) {
          process.stderr.write(`\rprogress ${e.value}/${e.max}`);
        }
      },
    },
  );
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        runId: result.runId,
        artifacts: result.artifacts.map((a) => ({
          filename: a.filename,
          savedPath: a.savedPath,
          type: a.type,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

async function cmdExplain(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined) throw new Error("Usage: comfy explain <file | workflow.ts>");
  const graph = await graphFromInput(
    input,
    parseParams(flagList(flags, "param")),
    await loadDefsAny(flag(flags, "defs")),
  );
  process.stdout.write(explainGraph(graph) + "\n");
  return 0;
}

async function cmdCatalog(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const query = (positional[0] ?? "").toLowerCase();
  const from = flag(flags, "from") ?? path.join(PKG_ROOT, "src", "nodes", "gen", "catalog.json");
  let entries: Array<{
    classType: string;
    category: string;
    displayName?: string;
    inputs: Array<{ name: string }>;
    outputs: Array<{ type: string }>;
  }>;
  try {
    const json = JSON.parse(await readFile(from, "utf8")) as { nodes?: typeof entries };
    entries = json.nodes ?? (json as unknown as typeof entries);
  } catch {
    throw new Error(`Catalog not found at ${from}; run \`comfy codegen\` first or pass --from`);
  }
  const hits = entries.filter((e) => {
    if (query === "") return true;
    return (
      e.classType.toLowerCase().includes(query) ||
      (e.displayName ?? "").toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query)
    );
  });
  process.stdout.write(
    hits
      .map(
        (e) =>
          `${e.classType}  [${e.category}]  in: ${e.inputs.map((i) => i.name).join(",")}  out: ${e.outputs.map((o) => o.type).join(",")}`,
      )
      .join("\n") + (hits.length > 0 ? "\n" : ""),
  );
  return 0;
}
