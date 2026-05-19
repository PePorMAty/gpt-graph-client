import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { layoutTree, type LayoutDirection } from "./layoutTree";
import { findRootNodeId } from "./findRootNodeId";

export async function applyAutoLayout(
  nodes: CustomNode[],
  edges: Edge[],
  direction?: LayoutDirection,
): Promise<{ nodes: CustomNode[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges };
  const rootId = findRootNodeId(nodes, edges) ?? undefined;
  return layoutTree(nodes, edges, rootId, direction);
}
