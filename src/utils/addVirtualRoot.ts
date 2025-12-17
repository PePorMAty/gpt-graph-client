// utils/addVirtualRoot.ts
import type { Node, Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export const VIRTUAL_ROOT_ID = "__virtual_root__";

export function addVirtualRootForLayout(
  nodes: CustomNode[],
  edges: Edge[]
): {
  nodes: Node[]; // ⬅ ОБЫЧНЫЕ Node, не CustomNode
  edges: Edge[];
  rootId: string | null;
} {
  const incoming = new Map<string, number>();

  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) =>
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1)
  );

  const roots = nodes.filter((n) => (incoming.get(n.id) || 0) === 0);

  if (roots.length <= 1) {
    return { nodes, edges, rootId: null };
  }

  const virtualRoot: Node = {
    id: VIRTUAL_ROOT_ID,
    position: { x: 0, y: 0 },
    data: { __virtual: true }, // ⬅ НЕ CustomNodeData
    draggable: false,
    selectable: false,
    hidden: true,
  };

  return {
    rootId: VIRTUAL_ROOT_ID,
    nodes: [virtualRoot, ...nodes],
    edges: [
      ...edges,
      ...roots.map((r) => ({
        id: `vr-${r.id}`,
        source: VIRTUAL_ROOT_ID,
        target: r.id,
        hidden: true,
      })),
    ],
  };
}
