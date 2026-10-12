import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { withoutRecycle } from "./recycleEdge";

export function getMaxDepth(
  nodes: CustomNode[],
  allEdges: Edge[],
  nodeId: string,
  direction: "up" | "down",
): number {
  // Глубина — по цепочке построения, без связей рециклинга.
  const edges = withoutRecycle(allEdges);
  const visited = new Set<string>();

  const walk = (id: string): number => {
    let max = 0;

    edges
      .filter((e) => (direction === "up" ? e.target === id : e.source === id))
      .forEach((e) => {
        const nextId = direction === "up" ? e.source : e.target;
        if (visited.has(nextId)) return;

        visited.add(nextId);

        const nextNode = nodes.find((n) => n.id === nextId);
        if (!nextNode) return;

        const isProduct = nextNode.type === "product";

        const depthFromHere = walk(nextId);

        max = Math.max(max, (isProduct ? 1 : 0) + depthFromHere);
      });

    return max;
  };

  visited.add(nodeId);
  return walk(nodeId);
}
