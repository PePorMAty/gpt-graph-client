import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export function getLeafNodes(nodes: CustomNode[], edges: Edge[]): string[] {
  const hasOutgoing = new Set<string>();

  edges.forEach((e) => {
    hasOutgoing.add(e.source);
  });

  return nodes.map((n) => n.id).filter((id) => !hasOutgoing.has(id));
}
