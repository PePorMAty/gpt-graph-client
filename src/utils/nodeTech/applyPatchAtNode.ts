import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../../types";

function collectDownstream(startId: string, edges: Edge[]) {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  const seen = new Set<string>();
  const q = [startId];
  // ВАЖНО: мы хотим удалить "детей", но не сам startId
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

export function applyPatchAtNode(
  existing: { nodes: CustomNode[]; edges: Edge[] },
  selectedNodeId: string,
  patch: { nodes: CustomNode[]; edges: Edge[] },
): { nodes: CustomNode[]; edges: Edge[] } {
  // 1) удаляем текущую ветку вниз от выбранной ноды
  const toRemove = collectDownstream(selectedNodeId, existing.edges);

  const keptNodes = existing.nodes.filter((n) => !toRemove.has(n.id));
  const keptEdges = existing.edges.filter(
    (e) =>
      !toRemove.has(e.source) &&
      !toRemove.has(e.target) &&
      e.source !== selectedNodeId, // удаляем все исходящие ребра выбранной ноды (заменим)
  );

  // 2) маппим id патча: root product -> selectedNodeId, остальные -> новые uuid
  const patchRoot = patch.nodes.find((n) => n.type === "product");
  if (!patchRoot) {
    return { nodes: keptNodes, edges: keptEdges };
  }

  const idMap = new Map<string, string>();
  idMap.set(patchRoot.id, selectedNodeId);

  patch.nodes.forEach((n) => {
    if (n.id === patchRoot.id) return;
    idMap.set(n.id, crypto.randomUUID());
  });

  const mappedNodes: CustomNode[] = patch.nodes
    .filter((n) => n.id !== patchRoot.id) // root не добавляем — он уже есть в existing
    .map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
    })) as CustomNode[];

  const mappedEdges: Edge[] = patch.edges
    .map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      type: "straight",
    }))
    // убираем мусор если вдруг не промаппилось
    .filter((e) => e.source && e.target);

  return {
    nodes: [...keptNodes, ...mappedNodes],
    edges: [...keptEdges, ...mappedEdges],
  };
}
