import dagre from "@dagrejs/dagre";
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const RANK_SEP = 160;
const NODE_SEP = 80;

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export type LayoutTreeResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

function positionsForDirection(direction: LayoutDirection): {
  source: Position;
  target: Position;
} {
  switch (direction) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
  }
}

/**
 * Fallback layout: longest-path topological sort (Kahn's + DP).
 * Handles DAGs correctly, including shared nodes and cycles.
 */
function hierarchicalLayout(
  nodes: CustomNode[],
  edges: Edge[],
  rankdir: LayoutDirection,
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
  const isHorizontal = rankdir === "LR" || rankdir === "RL";

  for (const [lvl, ids] of byLevel) {
    const n = ids.length;
    if (isHorizontal) {
      const colHeight = n * NODE_HEIGHT + (n - 1) * NODE_SEP;
      const startY = -colHeight / 2 + NODE_HEIGHT / 2;
      const x =
        rankdir === "LR"
          ? lvl * (NODE_WIDTH + RANK_SEP)
          : (totalLevels - lvl) * (NODE_WIDTH + RANK_SEP);
      ids.forEach((id, i) => {
        posMap.set(id, { x, y: startY + i * (NODE_HEIGHT + NODE_SEP) });
      });
    } else {
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
  }

  const { source, target } = positionsForDirection(rankdir);
  return nodes.map((node) => ({
    ...node,
    position: posMap.get(node.id) ?? node.position,
    sourcePosition: source,
    targetPosition: target,
  }));
}

export async function layoutTree(
  nodes: CustomNode[],
  edges: Edge[],
  rootId?: string,
  direction?: LayoutDirection,
): Promise<LayoutTreeResult> {
  if (!nodes.length) {
    return { nodes, edges };
  }

  // Если direction задан явно (из загруженного JSON) — используем его.
  // Иначе: rootId с входящими — sink, rankdir TB; иначе источник — rankdir BT.
  let rankdir: LayoutDirection;
  if (direction) {
    rankdir = direction;
  } else {
    const hasIncoming = rootId
      ? edges.some((e) => e.target === rootId)
      : true;
    rankdir = hasIncoming ? "TB" : "BT";
  }

  // --- Пробуем ELK (layered) для сложных графов ---
  // На объединённых графах общие узлы становятся хабами с десятками
  // связей, dagre тогда даёт сильное наложение и пересечения рёбер.
  // ELK с LAYER_SWEEP сильно лучше.
  // Ленивая загрузка: ELK (~1.5MB) выносится из основного бандла.
  const isComplex = nodes.length >= 30 || edges.length >= nodes.length * 1.2;
  if (isComplex) {
    try {
      const { layoutWithElk } = await import("./layoutWithElk");
      const result = await layoutWithElk(nodes, edges, rankdir);
      return result;
    } catch (e) {
      console.warn("[layoutTree] ELK failed, fallback to dagre:", e);
    }
  }

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

  const { source, target } = positionsForDirection(rankdir);
  const layoutedNodes: CustomNode[] = nodes.map((node, i) => ({
    ...node,
    position: dagrePositions[i]!,
    sourcePosition: source,
    targetPosition: target,
  }));

  return { nodes: layoutedNodes, edges };
}