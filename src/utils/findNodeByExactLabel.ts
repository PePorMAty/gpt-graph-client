// utils/findNodeByExactLabel.ts

import type { CustomNode } from "../types";

export function findNodeByExactLabel(
  nodes: CustomNode[],
  query: string
): CustomNode | null {
  const normalized = query.trim();

  if (!normalized) return null;

  return (
    nodes.find(
      (n) =>
        n.data?.label === normalized &&
        (n.type === "product" || n.type === "transformation")
    ) ?? null
  );
}
