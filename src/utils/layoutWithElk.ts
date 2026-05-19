import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const elk = new ELK();

export type ElkDirection = "TB" | "BT" | "LR" | "RL";

export type ElkLayoutResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

const ELK_DIRECTION_MAP: Record<ElkDirection, string> = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

const HANDLE_POSITIONS: Record<
  ElkDirection,
  { source: Position; target: Position }
> = {
  TB: { source: Position.Bottom, target: Position.Top },
  BT: { source: Position.Top, target: Position.Bottom },
  LR: { source: Position.Right, target: Position.Left },
  RL: { source: Position.Left, target: Position.Right },
};

/**
 * Лейаут через ELK (алгоритм layered) с минимизацией пересечений.
 * Подходит для сложных DAG: общих узлов-хабов, множества рёбер.
 *
 * Возвращает узлы с обновлёнными позициями. Кидает при ошибке —
 * вызывающий должен обработать (например, упасть в dagre fallback).
 */
export async function layoutWithElk(
  nodes: CustomNode[],
  edges: Edge[],
  rankdir: ElkDirection = "TB",
): Promise<ElkLayoutResult> {
  if (!nodes.length) return { nodes, edges };

  const direction = ELK_DIRECTION_MAP[rankdir];

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target),
  );

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "20",
      "elk.layered.mergeEdges": "true",
      "elk.layered.thoroughness": "10",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: validEdges.map((e, i) => ({
      id: typeof e.id === "string" && e.id ? e.id : `elk-edge-${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laid = await elk.layout(elkGraph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laid.children ?? []) {
    if (
      typeof child.x === "number" &&
      typeof child.y === "number" &&
      Number.isFinite(child.x) &&
      Number.isFinite(child.y)
    ) {
      positions.set(child.id, { x: child.x, y: child.y });
    }
  }

  if (positions.size < nodes.length) {
    throw new Error(
      `ELK выдал позиции только для ${positions.size}/${nodes.length} узлов`,
    );
  }

  const { source, target } = HANDLE_POSITIONS[rankdir];
  const layoutedNodes: CustomNode[] = nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
    sourcePosition: source,
    targetPosition: target,
  }));

  return { nodes: layoutedNodes, edges };
}
