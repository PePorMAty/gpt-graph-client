import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { withoutRecycle } from "./recycleEdge";

export function findRootNodeId(nodes: CustomNode[], edges: Edge[]) {
  // Связь рециклинга может вести и в корень — корнем он от этого не перестаёт.
  const targets = new Set(withoutRecycle(edges).map((e) => e.target));
  return nodes.find((n) => !targets.has(n.id))?.id ?? null;
}
