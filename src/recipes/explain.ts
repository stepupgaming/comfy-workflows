import type { Graph } from "../ir/index.js";
import { sortedNodeIds } from "../ir/types.js";
import { isParamRef } from "../ir/types.js";
import { AssetRef } from "../ir/types.js";
import { templateParams, templatePorts } from "../ir/template.js";

/**
 * explainGraph — human/agent-readable expansion of a template or graph:
 * nodes, params, connections, template params/ports/outputs. This is the
 * observability surface for agents ("what did hiresFix actually create?").
 */
export function explainGraph(g: Graph): string {
  const lines: string[] = [];
  lines.push(g.name !== undefined ? `workflow: ${g.name}` : "workflow");
  if (g.params && Object.keys(g.params).length > 0) {
    const params = templateParams(g)
      .map((p) => `${p.name}${p.required ? "" : "?"}${p.type ? `:${p.type}` : ""}`)
      .join(", ");
    lines.push(`params: ${params}`);
  }
  if (g.ports && g.ports.length > 0) {
    lines.push(
      `ports: ${templatePorts(g)
        .map((p) => `${p.name}${p.type ? `:${p.type}` : ""}`)
        .join(", ")}`,
    );
  }
  lines.push(`nodes (${Object.keys(g.nodes).length}):`);
  for (const id of sortedNodeIds(g)) {
    const n = g.nodes[id];
    const mode = n.mode && n.mode !== "active" ? ` [${n.mode}]` : "";
    const bits: string[] = [];
    for (const [k, v] of Object.entries(n.params)) bits.push(`${k}=${describeValue(v)}`);
    for (const [k, v] of Object.entries(n.inputs)) {
      bits.push(
        Array.isArray(v)
          ? `${k}=[${v.map((r) => `${r.node}:${r.out}`).join(", ")}]`
          : `${k}←${v.node}:${v.out}`,
      );
    }
    lines.push(`  ${id}: ${n.type}${mode}${bits.length ? ` { ${bits.join(", ")} }` : ""}`);
  }
  if (g.outputs.length > 0) {
    lines.push(
      `outputs: ${g.outputs.map((o) => `${o.node}:${o.out}${o.name ? ` (${o.name})` : ""}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}

function describeValue(v: unknown): string {
  if (isParamRef(v)) return `<param:${v.$param}>`;
  if (v instanceof AssetRef) return `<asset:${v.path}>`;
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(describeValue).join(", ")}]`;
  if (v === null) return "null";
  return String(v);
}
