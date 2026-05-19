import type { Node } from "@xyflow/react";

export function centerTreeOnRoot<T extends Node>(
  nodes: T[],
  rootId: string
): T[] {
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return nodes;

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const centerX = (minX + maxX) / 2;

  const deltaX = centerX - root.position.x;

  return nodes.map((n) => ({
    ...n,
    position: {
      x: n.position.x - deltaX,
      y: n.position.y,
    },
  }));
}
