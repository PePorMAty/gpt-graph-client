import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export type DirectProductNeighbor = {
  neighborNodeId: string;
  neighborLabel: string;
  edgeId: string;
  role: "incoming" | "outgoing";
};

export function getDirectProductNeighbors(
  nodeId: string,
  nodes: CustomNode[],
  edges: Edge[],
): DirectProductNeighbor[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== "product") return [];

  const result: DirectProductNeighbor[] = [];
  const seenNeighbors = new Set<string>();

  for (const e of edges) {
    if (e.source === e.target) continue;

    let otherId: string | null = null;
    let role: "incoming" | "outgoing" | null = null;

    if (e.source === nodeId) {
      otherId = e.target;
      role = "outgoing";
    } else if (e.target === nodeId) {
      otherId = e.source;
      role = "incoming";
    }

    if (!otherId || !role) continue;
    if (seenNeighbors.has(otherId)) continue;

    const other = nodes.find((n) => n.id === otherId);
    if (!other || other.type !== "product") continue;

    seenNeighbors.add(otherId);
    result.push({
      neighborNodeId: otherId,
      neighborLabel: String(other.data?.label ?? ""),
      edgeId: e.id,
      role,
    });
  }

  return result;
}
