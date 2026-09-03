import type { Graph } from "../ir/types.js";
import { templateParams } from "../ir/template.js";
import type { WorkflowManifest } from "./manifest.js";
import { deriveNodeClasses, findEmbeddedLocalPaths } from "./discover.js";

/**
 * Manifest ↔ IR coherence checks. Shared by `cwf pack` and the test suite.
 * All pure data — no package code execution.
 */

export interface PackDiagnostic {
  level: "error" | "warning";
  code: string;
  message: string;
  hint?: string;
}

export interface PackReport {
  ok: boolean;
  diagnostics: PackDiagnostic[];
  nodeClasses: { manifest: string[]; derived: string[] };
}

/**
 * Validate a manifest against its IR graph:
 * - every manifest parameter exists in the template (and vice versa),
 * - required-ness matches (a manifest-required param must have no default
 *   in either the manifest or the IR),
 * - manifest outputs name real graph outputs,
 * - nodeClasses match the derived set (missing OR stale entries are errors —
 *   a stale allowlist silently under-reports requirements),
 * - no absolute machine-local paths embedded in the IR.
 */
export function checkPackageCoherence(manifest: WorkflowManifest, graph: Graph): PackReport {
  const diagnostics: PackDiagnostic[] = [];
  const err = (code: string, message: string, hint?: string): void => {
    diagnostics.push({ level: "error", code, message, hint });
  };
  const warn = (code: string, message: string, hint?: string): void => {
    diagnostics.push({ level: "warning", code, message, hint });
  };

  // --- parameters ---
  const irParams = new Map(templateParams(graph).map((p) => [p.name, p]));
  for (const [name, mp] of Object.entries(manifest.parameters)) {
    const ip = irParams.get(name);
    if (!ip) {
      err(
        "E_PACK_UNKNOWN_PARAM",
        `Manifest parameter "${name}" is not declared in the IR template.`,
      );
      continue;
    }
    if (mp.required && !ip.required && mp.default === undefined)
      err(
        "E_PACK_PARAM_REQUIRED_MISMATCH",
        `Parameter "${name}" is required in the manifest but has a default in the IR.`,
        "Either mark it optional in the manifest or remove the default.",
      );
  }
  for (const name of irParams.keys()) {
    if (!(name in manifest.parameters))
      err(
        "E_PACK_MISSING_PARAM",
        `IR template parameter "${name}" is not declared in the manifest.`,
        "Every template param must be documented in comfy.workflow.json.",
      );
  }

  // --- outputs ---
  graph.outputs.forEach((o, i) => {
    const node = graph.nodes[o.node];
    if (!node) {
      err("E_PACK_BAD_OUTPUT", `Graph output #${i} references unknown node "${o.node}".`);
      return;
    }
    const def = manifest.outputs.find((m) => m.name === (o.name ?? `output-${i}`));
    if (!def) {
      err(
        "E_PACK_MISSING_OUTPUT",
        `Graph output #${i} (node "${o.node}" slot ${o.out}${o.name ? `, name "${o.name}"` : ""}) has no manifest outputs entry.`,
      );
    }
  });
  manifest.outputs.forEach((m, i) => {
    const match = graph.outputs.find((o, j) => (o.name ?? `output-${j}`) === m.name);
    if (!match)
      err("E_PACK_UNKNOWN_OUTPUT", `Manifest outputs[${i}] ("${m.name}") matches no graph output.`);
  });

  // --- node classes ---
  const derived = deriveNodeClasses(graph);
  const declared = [...manifest.requires.nodeClasses].sort();
  const missing = derived.filter((c) => !declared.includes(c));
  const stale = declared.filter((c) => !derived.includes(c));
  if (missing.length > 0)
    err(
      "E_PACK_NODE_CLASSES_MISSING",
      `Manifest requires.nodeClasses omits classes used by the IR: ${missing.join(", ")}.`,
      "Add them, or leave the list empty only if the IR needs no nodes (never).",
    );
  if (stale.length > 0)
    err(
      "E_PACK_NODE_CLASSES_STALE",
      `Manifest requires.nodeClasses lists classes absent from the IR: ${stale.join(", ")}.`,
    );

  // --- portability ---
  for (const p of findEmbeddedLocalPaths(graph))
    err(
      "E_PACK_LOCAL_PATH",
      `IR embeds a machine-local path: ${p}.`,
      "Parametrize the path or ship it relative to the package.",
    );

  // --- informational ---
  if (manifest.requires.nodePacks.length === 0)
    warn(
      "W_PACK_NO_NODE_PACKS",
      "requires.nodePacks is empty; consumers cannot tell which custom-node packs to install.",
      "Fill it in when the pack mapping is known.",
    );

  return {
    ok: !diagnostics.some((d) => d.level === "error"),
    diagnostics,
    nodeClasses: { manifest: declared, derived },
  };
}
