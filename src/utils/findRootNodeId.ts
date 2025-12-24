import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export function findRootNodeId(nodes: CustomNode[], edges: Edge[]) {
  const targets = new Set(edges.map((e) => e.target));
  return nodes.find((n) => !targets.has(n.id))?.id ?? null;
}
