import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ComfyError, ErrorCodes } from "../errors.js";
import { graphFromValue, parseGraph } from "../ir/serialize.js";
import type { Graph } from "../ir/types.js";
import {
  WORKFLOW_MANIFEST_FILENAME,
  WORKFLOW_PACKAGE_JSON_KEY,
  parseWorkflowManifest,
  type WorkflowManifest,
} from "./manifest.js";

/**
 * Package discovery + IR loading. Everything here is pure data access:
 * package.json → comfy.workflow.json → workflow.ir.json. Package JavaScript
 * is NEVER imported or executed on this path.
 */

export interface DiscoveredPackage {
  /** Directory the package was discovered in. */
  dir: string;
  /** Raw package.json (kept for name/version/keyword checks). */
  packageJson: Record<string, unknown>;
  /** Validated manifest. */
  manifest: WorkflowManifest;
  /** Absolute path of the resolved IR entry. */
  irPath: string;
}

function fail(message: string, hint?: string): never {
  throw new ComfyError({ code: ErrorCodes.InvalidGraph, message, hint });
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`Cannot read ${file}`);
  }
  try {
    return JSON.parse(text!);
  } catch (e) {
    fail(`${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Resolve a package specifier to a directory: node_modules lookup or a path. */
export function resolvePackageDir(spec: string, fromDir = process.cwd()): string {
  // Explicit paths (./, ../, /, C:\, \\server) resolve directly. Anything
  // else containing a separator (e.g. "packages/foo") is tried as a path
  // first — but a scoped npm name ("@scope/pkg") must NOT be hijacked, so
  // fall through to module resolution when no package.json is there.
  const looksLikePath =
    spec.startsWith(".") ||
    path.isAbsolute(spec) ||
    /^[A-Za-z]:[\\/]/.test(spec) ||
    spec.startsWith("\\\\");
  const candidate = path.resolve(fromDir, spec);
  if (
    looksLikePath ||
    ((spec.includes("/") || spec.includes("\\")) &&
      existsSync(path.join(candidate, "package.json")))
  ) {
    if (!existsSync(path.join(candidate, "package.json")))
      fail(
        `No package.json found at ${candidate}`,
        "Pass an installed package name or a package directory.",
      );
    return candidate;
  }
  // Bare specifier: resolve through node module resolution from the cwd.
  // createRequire (not bare require) because this module ships as ESM.
  try {
    const requireFrom = createRequire(path.join(fromDir, "package.json"));
    const pkgJson = requireFrom.resolve(path.join(spec, "package.json"));
    return path.dirname(pkgJson);
  } catch {
    fail(
      `Cannot resolve installed package "${spec}" from ${fromDir}`,
      "Install it first (e.g. pnpm add <package>), or pass a directory path.",
    );
  }
}

/** Discover + validate a workflow package. Never executes package code. */
export function discoverPackage(spec: string, fromDir = process.cwd()): DiscoveredPackage {
  const dir = resolvePackageDir(spec, fromDir);
  const packageJson = readJson(path.join(dir, "package.json")) as Record<string, unknown>;

  const pointer = packageJson[WORKFLOW_PACKAGE_JSON_KEY];
  const manifestRel = typeof pointer === "string" ? pointer : `./${WORKFLOW_MANIFEST_FILENAME}`;
  if (typeof pointer !== "string" && !existsSync(path.join(dir, WORKFLOW_MANIFEST_FILENAME)))
    fail(
      `Package at ${dir} has no "${WORKFLOW_PACKAGE_JSON_KEY}" pointer and no ${WORKFLOW_MANIFEST_FILENAME}`,
      `Add "${WORKFLOW_PACKAGE_JSON_KEY}": "./${WORKFLOW_MANIFEST_FILENAME}" to its package.json.`,
    );
  const manifestPath = path.resolve(dir, manifestRel);
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`);
  const manifest = parseWorkflowManifest(readJson(manifestPath));

  // Entry must stay inside the package (no ../ escapes, no absolute paths).
  const irPath = path.resolve(dir, manifest.entry);
  const rel = path.relative(dir, irPath);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    fail(`Manifest entry escapes the package: ${manifest.entry}`);
  if (!existsSync(irPath)) fail(`Manifest entry not found: ${irPath} (from "${manifest.entry}")`);
  return { dir, packageJson, manifest, irPath };
}

/** Load the package's canonical IR document (lossless: bigint seeds survive). */
export function loadPackageGraph(pkg: DiscoveredPackage): Graph {
  const text = readFileSync(pkg.irPath, "utf8");
  try {
    return parseGraph(text);
  } catch (e) {
    if (e instanceof ComfyError) throw e;
    fail(`IR entry ${pkg.irPath} failed to parse: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Load + parse IR from a raw value (fixtures/tests). */
export function graphFromPackageValue(value: unknown): Graph {
  return graphFromValue(value);
}

/**
 * Deterministically derive required node class names from IR.
 * Sorted, deduplicated — the non-negotiable requirement is that nodeClasses
 * be explicit in the manifest OR match this derivation.
 */
export function deriveNodeClasses(graph: Graph): string[] {
  return [...new Set(Object.values(graph.nodes).map((n) => n.type))].sort();
}
