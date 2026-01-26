import type { Edge } from "@xyflow/react";

export function getMaxDepth(
  edges: Edge[],
  nodeId: string,
  direction: "up" | "down",
): number {
  const visited = new Set<string>();

  const walk = (id: string): number => {
    let max = 0;

    edges
      .filter((e) => (direction === "up" ? e.target === id : e.source === id))
      .forEach((e) => {
        const next = direction === "up" ? e.source : e.target;
        if (visited.has(next)) return;

        visited.add(next);
        max = Math.max(max, 1 + walk(next));
      });

    return max;
  };

  visited.add(nodeId);
  return walk(nodeId);
}
