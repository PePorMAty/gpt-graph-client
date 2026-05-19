import type { CustomEdge, CustomNode } from "../types";
import { colorForNode } from "./sourceColorRegistry";
import type { ParseResult } from "./parseProductGraphJson";

export interface MergeInput {
  existingNodes: CustomNode[];
  existingEdges: CustomEdge[];
  parsed: ParseResult;
  registry: Record<string, string>;
}

export interface MergeOutput {
  nodes: CustomNode[];
  edges: CustomEdge[];
  idRemap: Record<string, string>;
}

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mergeProductGraph({
  existingNodes,
  existingEdges,
  parsed,
  registry,
}: MergeInput): MergeOutput {
  const labelToId = new Map<string, string>();
  for (const n of existingNodes) {
    if (n.type !== "product") continue;
    const label = typeof n.data?.label === "string" ? n.data.label : "";
    if (!label) continue;
    labelToId.set(normalizeLabel(label), n.id);
  }

  const mutatedNodes: CustomNode[] = existingNodes.map((n) => ({
    ...n,
    data: { ...n.data },
  }));

  const idRemap: Record<string, string> = {};
  const newNodes: CustomNode[] = [];

  for (const p of parsed.nodes) {
    const key = normalizeLabel(p.label);
    if (p.type === "product") {
      const existingId = labelToId.get(key);
      if (existingId) {
        idRemap[p.id] = existingId;
        const target = mutatedNodes.find((n) => n.id === existingId);
        if (target) {
          const prevSources = Array.isArray(target.data.sources)
            ? (target.data.sources as string[])
            : [];
          const mergedSources = Array.from(
            new Set([...prevSources, ...p.sources])
          );
          target.data.sources = mergedSources;
          target.data.color = colorForNode(mergedSources, registry);
        }
        continue;
      }
    }

    const newNode: CustomNode = {
      id: p.id,
      type: p.type,
      position: { x: 0, y: 0 },
      data: {
        label: p.label,
        sources: p.sources,
        color:
          p.type === "product" ? colorForNode(p.sources, registry) : undefined,
      },
      draggable: true,
    };
    newNodes.push(newNode);
    if (p.type === "product") {
      labelToId.set(key, p.id);
    }
  }

  const newEdges: CustomEdge[] = [];
  for (const e of parsed.edges) {
    const source = idRemap[e.source] ?? e.source;
    const target = idRemap[e.target] ?? e.target;
    if (source === target) continue;
    newEdges.push({
      id: e.id,
      source,
      target,
      type: "straight",
    });
  }

  return {
    nodes: [...mutatedNodes, ...newNodes],
    edges: [...existingEdges, ...newEdges],
    idRemap,
  };
}
