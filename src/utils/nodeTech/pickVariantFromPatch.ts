import type { Node, Edge } from "@xyflow/react";
import type { NodeTechResponse } from "../../store/types";

function collectReachable(rootId: string, edges: Edge[]) {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  const seen = new Set<string>();
  const q = [rootId];
  seen.add(rootId);

  while (q.length) {
    const cur = q.shift()!;
    for (const nxt of adj.get(cur) || []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        q.push(nxt);
      }
    }
  }

  return seen;
}

/**
 * variantKey:
 * - "main"  => берём трансформацию "сводная технология"
 * - altName => берём трансформацию по exact label
 */
export function buildVariantGraphFromResponse(
  resp: NodeTechResponse,
  variantKey: "main" | string,
): { nodes: Node[]; edges: Edge[] } {
  const patch = resp.graph_patch.graph;
  const nodes = patch.nodes;
  const edges = patch.edges;

  const root = nodes.find((n) => n.type === "product"); // в патче корень — продукт
  if (!root) return { nodes: [], edges: [] };

  let startTransformation: Node | undefined;

  if (variantKey === "main") {
    startTransformation = nodes.find(
      (n) =>
        n.type === "transformation" &&
        (n.data?.label || "").toLowerCase().includes("сводная"),
    );
  } else {
    startTransformation = nodes.find(
      (n) =>
        n.type === "transformation" && (n.data?.label || "") === variantKey,
    );
  }

  if (!startTransformation) {
    // fallback: берём первую трансформацию после root (по ребру root->*)
    const edgeToTr = edges.find((e) => e.source === root.id);
    startTransformation = nodes.find((n) => n.id === edgeToTr?.target);
  }

  if (!startTransformation) return { nodes: [], edges: [] };

  // разрешённые ноды: root + все достижимые от выбранной трансформации
  const reachable = collectReachable(startTransformation.id, edges);
  reachable.add(root.id);
  reachable.add(startTransformation.id);

  // плюс ребро root->transformation
  const mustEdge = edges.find(
    (e) => e.source === root.id && e.target === startTransformation!.id,
  );

  const filteredNodes = nodes.filter((n) => reachable.has(n.id));
  const filteredEdges = edges.filter(
    (e) => reachable.has(e.source) && reachable.has(e.target),
  );

  if (mustEdge && !filteredEdges.some((e) => e.id === mustEdge.id)) {
    filteredEdges.push(mustEdge);
  }

  return { nodes: filteredNodes, edges: filteredEdges };
}
