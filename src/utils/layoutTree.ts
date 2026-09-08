import dagre from "@dagrejs/dagre";
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const RANK_SEP = 160;
const NODE_SEP = 80;

/**
 * Габариты «ячейки» узла и зазоры для раскладки. Значения по умолчанию —
 * просторные, под полный граф. Фокус-режим передаёт свои, более плотные:
 * там весь подграф вписывается в экран целиком, и лишние пустоты между
 * рангами напрямую съедают масштаб, а с ним и читаемость подписей.
 */
export type LayoutSpacing = {
  nodeWidth?: number;
  nodeHeight?: number;
  /** Расстояние между рангами (по направлению раскладки). */
  rankSep?: number;
  /** Расстояние между соседями внутри ранга. */
  nodeSep?: number;
  /**
   * Габарит конкретного узла. Без него все узлы считаются одного размера
   * (nodeWidth × nodeHeight), и при плотной раскладке высокие подписи в две
   * строки съедают зазор между рангами. С ним rankSep — настоящий видимый
   * просвет между узлами.
   */
  measure?: (node: CustomNode) => { width: number; height: number };
};

function resolveSpacing(spacing?: LayoutSpacing) {
  return {
    nodeWidth: spacing?.nodeWidth ?? NODE_WIDTH,
    nodeHeight: spacing?.nodeHeight ?? NODE_HEIGHT,
    rankSep: spacing?.rankSep ?? RANK_SEP,
    nodeSep: spacing?.nodeSep ?? NODE_SEP,
  };
}

export type LayoutTreeResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

/**
 * Ранг каждого узла: longest-path topological sort (Kahn's + DP).
 * Handles DAGs correctly, including shared nodes and cycles.
 * Ранги — это ряды будущей раскладки, поэтому по ним же можно заранее
 * прикинуть, насколько высокой она получится (см. focusLayoutSpacing).
 */
export function longestPathLevels(
  nodes: CustomNode[],
  edges: Edge[],
): Map<string, number> {
  const nodeSet = new Set(nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  const inDegMap = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (const edge of edges) {
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    inDegMap.set(edge.target, (inDegMap.get(edge.target) ?? 0) + 1);
  }

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

  return level;
}

/** Сколько рядов будет в раскладке этого графа. */
export function countLayoutRanks(nodes: CustomNode[], edges: Edge[]): number {
  if (!nodes.length) return 0;
  return new Set(longestPathLevels(nodes, edges).values()).size;
}

/** Fallback layout поверх longestPathLevels. */
function hierarchicalLayout(
  nodes: CustomNode[],
  edges: Edge[],
  rankdir: "TB" | "BT",
  spacing?: LayoutSpacing,
): CustomNode[] {
  const { nodeWidth, nodeHeight, rankSep, nodeSep } = resolveSpacing(spacing);
  const level = longestPathLevels(nodes, edges);

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
    const rowWidth = n * nodeWidth + (n - 1) * nodeSep;
    const startX = -rowWidth / 2 + nodeWidth / 2;
    const y =
      rankdir === "TB"
        ? lvl * (nodeHeight + rankSep)
        : (totalLevels - lvl) * (nodeHeight + rankSep);

    ids.forEach((id, i) => {
      posMap.set(id, { x: startX + i * (nodeWidth + nodeSep), y });
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
  direction?: "TB" | "BT",
  spacing?: LayoutSpacing,
): Promise<LayoutTreeResult> {
  if (!nodes.length) {
    return { nodes, edges };
  }

  const { nodeWidth, nodeHeight, rankSep, nodeSep } = resolveSpacing(spacing);

  // Если direction явно передан вызывающим — используем его.
  // Иначе: rootId с входящими — sink, rankdir TB; иначе источник — rankdir BT.
  let rankdir: "TB" | "BT";
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
      const result = await layoutWithElk(nodes, edges, rankdir, spacing);
      return result;
    } catch (e) {
      console.warn("[layoutTree] ELK failed, fallback to dagre:", e);
    }
  }

  // --- Пробуем dagre ---
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sizeOf = (node: CustomNode) =>
    spacing?.measure?.(node) ?? { width: nodeWidth, height: nodeHeight };

  for (const node of nodes) {
    g.setNode(node.id, sizeOf(node));
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
    return { nodes: hierarchicalLayout(nodes, edges, rankdir, spacing), edges };
  }

  // Проверяем валидность позиций от dagre
  // dagre возвращает ЦЕНТР узла — переводим в левый верхний угол по его
  // собственным габаритам, иначе разновысокие узлы съедут по вертикали.
  const dagrePositions = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return null;
    const size = sizeOf(node);
    return { x: pos.x - size.width / 2, y: pos.y - size.height / 2 };
  });

  const validCount = dagrePositions.filter(Boolean).length;

  if (validCount < nodes.length) {
    // Часть нод не получила валидных позиций — используем fallback
    return { nodes: hierarchicalLayout(nodes, edges, rankdir, spacing), edges };
  }

  const layoutedNodes: CustomNode[] = nodes.map((node, i) => ({
    ...node,
    position: dagrePositions[i]!,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: layoutedNodes, edges };
}