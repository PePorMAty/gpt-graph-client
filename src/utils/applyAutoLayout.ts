import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { layoutTree } from "./layoutTree";
import { findRootNodeId } from "./findRootNodeId";

export async function applyAutoLayout(
  nodes: CustomNode[],
  edges: Edge[],
  direction?: "TB" | "BT",
): Promise<{ nodes: CustomNode[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges };
  const rootId = findRootNodeId(nodes, edges) ?? undefined;
  return layoutTree(nodes, edges, rootId, direction);
}
