// src/utils/layoutWithElk.ts
import ELK from "elkjs/lib/elk.bundled.js";

import type { CustomNode, CustomEdge } from "../types";
import { Position } from "@xyflow/react";

const elk = new ELK();
const VIRTUAL_ROOT = "__virtual_root__";

export async function layoutWithELK(
  nodes: CustomNode[],
  edges: CustomEdge[]
): Promise<{ nodes: CustomNode[]; edges: CustomEdge[] }> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const rootCandidates = nodes.filter(
    (n) => !edges.some((e) => e.target === n.id)
  );

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: [
      { id: VIRTUAL_ROOT, width: 1, height: 1 },
      ...nodes.map((n) => ({
        id: n.id,
        width: 220,
        height: 100,
      })),
    ],
    edges: [
      ...edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
      ...rootCandidates.map((n) => ({
        id: `${VIRTUAL_ROOT}->${n.id}`,
        sources: [VIRTUAL_ROOT],
        targets: [n.id],
      })),
    ],
  };

  const result = await elk.layout(elkGraph);

  const layoutedNodes: CustomNode[] = (result.children ?? [])
    .filter((n) => n.id !== VIRTUAL_ROOT)
    .map((n) => {
      const original = nodeMap.get(n.id)!;

      return {
        ...original,
        position: {
          x: n.x ?? 0,
          y: n.y ?? 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });

  const layoutedEdges: CustomEdge[] = edges.map((e) => ({
    ...e,
    type: "straight",
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
