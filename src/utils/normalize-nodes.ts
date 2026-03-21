import { Position } from "@xyflow/react";
import { type CustomNode, type GPTNode } from "../types";

export function normalizeNodes(nodes: GPTNode[]): CustomNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type ?? "default",
    position: n.position ?? { x: 0, y: 0 },

    data: {
      ...n.data,
      label: n.data?.label ?? "",
    },

    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    draggable: true,
  }));
}
