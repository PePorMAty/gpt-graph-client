// src/utils/extractSubgraph.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export function extractSubgraph(
  nodes: CustomNode[],
  edges: Edge[],
  centerId: string,
  depthUp = 2,
  depthDown = 2,
) {
  const up = new Set<string>();
  const down = new Set<string>();

  const walkUp = (id: string, depth: number) => {
    if (depth === 0) return;

    edges
      .filter((e) => e.target === id)
      .forEach((e) => {
        if (!up.has(e.source)) {
          up.add(e.source);
          walkUp(e.source, depth - 1);
        }
      });
  };

  const walkDown = (id: string, depth: number) => {
    if (depth === 0) return;

    edges
      .filter((e) => e.source === id)
      .forEach((e) => {
        if (!down.has(e.target)) {
          down.add(e.target);
          walkDown(e.target, depth - 1);
        }
      });
  };

  walkUp(centerId, depthUp);
  walkDown(centerId, depthDown);

  const allowedIds = new Set([centerId, ...up, ...down]);

  return {
    nodes: nodes.filter((n) => allowedIds.has(n.id)),
    edges: edges.filter(
      (e) => allowedIds.has(e.source) && allowedIds.has(e.target),
    ),
    rootId: centerId,
  };
}
