import dagre from "@dagrejs/dagre";
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const RANK_SEP = 160;
const NODE_SEP = 80;

export type LayoutTreeResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

/**
 * Fallback layout: longest-path topological sort (Kahn's + DP).
 * Handles DAGs correctly, including shared nodes and cycles.
 */
function hierarchicalLayout(
  nodes: CustomNode[],
  edges: Edge[],
  rankdir: "TB" | "BT",
): CustomNode[] {
  const nodeSet = new Set(nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  const inDegMap = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (const edge of edges) {
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    inDegMap.set(edge.target, (inDegMap.get(edge.target) ?? 0) + 1);
  }

  // Kahn's topological sort + longest-path DP
  const level = new Map<string, number>();
  const tempInDeg = new Map(inDegMap);
  const queue: string[] = nodes
    .filter((n) => (inDegMap.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  for (const id of queue) level.set(id, 0);

  while (queue.length) {
    const id = queue.shift()!;
    const lvl = level.get(id) ?? 0;

    for (const child of children.get(id) ?? []) {
      const next = lvl + 1;
      if ((level.get(child) ?? -1) < next) level.set(child, next);
      const deg = (tempInDeg.get(child) ?? 1) - 1;
      tempInDeg.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }

  // Nodes in cycles (not reached by Kahn's) → extra level
  const maxLvl = level.size > 0 ? Math.max(...level.values()) : 0;
  for (const n of nodes) {
    if (!level.has(n.id)) level.set(n.id, maxLvl + 1);
  }

  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of level) {
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(id);
  }

  const totalLevels = Math.max(...byLevel.keys());
  const posMap = new Map<string, { x: number; y: number }>();

  for (const [lvl, ids] of byLevel) {
    const n = ids.length;
    const rowWidth = n * NODE_WIDTH + (n - 1) * NODE_SEP;
    const startX = -rowWidth / 2 + NODE_WIDTH / 2;
    const y =
      rankdir === "TB"
        ? lvl * (NODE_HEIGHT + RANK_SEP)
        : (totalLevels - lvl) * (NODE_HEIGHT + RANK_SEP);

    ids.forEach((id, i) => {
      posMap.set(id, { x: startX + i * (NODE_WIDTH + NODE_SEP), y });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: posMap.get(node.id) ?? node.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));
}

export async function layoutTree(
  nodes: CustomNode[],
  edges: Edge[],
  rootId?: string,
): Promise<LayoutTreeResult> {
  if (!nodes.length) {
    return { nodes, edges };
  }

  // Если у rootId нет входящих рёбер — он источник: rankdir BT ставит источник снизу.
  // Если есть входящие — он sink: rankdir TB ставит sink снизу.
  const hasIncoming = rootId
    ? edges.some((e) => e.target === rootId)
    : true;
  const rankdir = hasIncoming ? "TB" : "BT";

  // --- Пробуем dagre ---
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  try {
    dagre.layout(g);
  } catch {
    // dagre упал — используем hierarchical fallback
    return { nodes: hierarchicalLayout(nodes, edges, rankdir), edges };
  }

  // Проверяем валидность позиций от dagre
  const dagrePositions = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return null;
    return { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
  });

  const validCount = dagrePositions.filter(Boolean).length;

  if (validCount < nodes.length) {
    // Часть нод не получила валидных позиций — используем fallback
    return { nodes: hierarchicalLayout(nodes, edges, rankdir), edges };
  }

  const layoutedNodes: CustomNode[] = nodes.map((node, i) => ({
    ...node,
    position: dagrePositions[i]!,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: layoutedNodes, edges };
}