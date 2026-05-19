import type { Node } from "@xyflow/react";

/**
 * Центрирует дерево по оси, ПОПЕРЕЧНОЙ направлению layout.
 *  - vertical (TB/BT): центрируем по X (по умолчанию)
 *  - horizontal (LR/RL): центрируем по Y
 */
export function centerTreeOnRoot<T extends Node>(
  nodes: T[],
  rootId: string,
  orientation: "vertical" | "horizontal" = "vertical",
): T[] {
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return nodes;

  if (orientation === "horizontal") {
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const maxY = Math.max(...nodes.map((n) => n.position.y));
    const centerY = (minY + maxY) / 2;
    const deltaY = centerY - root.position.y;
    return nodes.map((n) => ({
      ...n,
      position: { x: n.position.x, y: n.position.y - deltaY },
    }));
  }

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const centerX = (minX + maxX) / 2;
  const deltaX = centerX - root.position.x;

  return nodes.map((n) => ({
    ...n,
    position: { x: n.position.x - deltaX, y: n.position.y },
  }));
}
