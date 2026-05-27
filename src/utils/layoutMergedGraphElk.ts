import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const elk = new ELK();

export type MergedGraphLayoutResult = {
  nodes: CustomNode[];
  edges: Edge[];
};

const ANCHOR_PREFIX = "__layer_anchor__";

/**
 * ELK layered layout специально для вкладки «Объединение графов».
 *
 * Если узлы содержат `data.layer` (число — номер слоя из JSON),
 * создаются невидимые anchor-узлы для каждого слоя, соединённые
 * цепочкой (anchor_0 → anchor_1 → …). Изолированные узлы
 * (без рёбер) подвязываются к anchor своего слоя, что гарантирует
 * правильное послойное размещение даже для disconnected-нод.
 *
 * Если `layer` нет — фоллбэк на предыдущее поведение (`LONGEST_PATH`
 * с `layerConstraint = FIRST` для сырья и `LAST` для конечных продуктов).
 */
export async function layoutMergedGraphElk(
  nodes: CustomNode[],
  edges: Edge[],
): Promise<MergedGraphLayoutResult> {
  if (!nodes.length) return { nodes, edges };

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target),
  );

  const hasLayerData = nodes.some(
    (n) => typeof (n.data as Record<string, unknown>)?.layer === "number",
  );

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of validEdges) {
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
  }

  type ElkChild = NonNullable<ElkNode["children"]>[number];
  type ElkEdge = NonNullable<ElkNode["edges"]>[number];

  const elkChildren: ElkChild[] = [];
  const elkEdges: ElkEdge[] = validEdges.map((e, i) => ({
    id: typeof e.id === "string" && e.id ? e.id : `elk-edge-${i}`,
    sources: [e.source],
    targets: [e.target],
  }));

  if (hasLayerData) {
    // Собираем все слои
    const layerSet = new Set<number>();
    const nodesByLayer = new Map<number, string[]>();

    for (const n of nodes) {
      const layer = (n.data as Record<string, unknown>)?.layer;
      const layerNum = typeof layer === "number" ? layer : 0;
      layerSet.add(layerNum);
      const list = nodesByLayer.get(layerNum);
      if (list) list.push(n.id);
      else nodesByLayer.set(layerNum, [n.id]);
    }

    const sortedLayers = [...layerSet].sort((a, b) => a - b);

    // Якорные узлы — один на слой, нулевого размера
    for (const l of sortedLayers) {
      elkChildren.push({
        id: `${ANCHOR_PREFIX}${l}`,
        width: 1,
        height: 1,
        layoutOptions: {
          "elk.layered.layering.layerConstraint":
            l === sortedLayers[0]
              ? "FIRST"
              : l === sortedLayers[sortedLayers.length - 1]
                ? "LAST"
                : "NONE",
        },
      });
    }

    // Цепочка anchor_0 → anchor_1 → … → anchor_N
    for (let i = 0; i < sortedLayers.length - 1; i++) {
      elkEdges.push({
        id: `${ANCHOR_PREFIX}edge_${sortedLayers[i]}_${sortedLayers[i + 1]}`,
        sources: [`${ANCHOR_PREFIX}${sortedLayers[i]}`],
        targets: [`${ANCHOR_PREFIX}${sortedLayers[i + 1]}`],
      });
    }

    // Реальные узлы + привязка КАЖДОГО к якорям его слоя.
    // anchor_{L-1} → node → anchor_L фиксирует node ровно на слое L:
    //   — anchor_{L-1} → node: node не может быть выше слоя L
    //   — node → anchor_L: node не может быть ниже слоя L
    // Для layer 0 — layerConstraint: FIRST.
    for (const n of nodes) {
      const layer = (n.data as Record<string, unknown>)?.layer;
      const layerNum = typeof layer === "number" ? layer : 0;
      const layerIdx = sortedLayers.indexOf(layerNum);

      elkChildren.push({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layoutOptions:
          layerIdx <= 0
            ? { "elk.layered.layering.layerConstraint": "FIRST" }
            : undefined,
      });

      if (layerIdx > 0) {
        elkEdges.push({
          id: `${ANCHOR_PREFIX}from_${n.id}`,
          sources: [`${ANCHOR_PREFIX}${sortedLayers[layerIdx - 1]}`],
          targets: [n.id],
        });
        elkEdges.push({
          id: `${ANCHOR_PREFIX}to_${n.id}`,
          sources: [n.id],
          targets: [`${ANCHOR_PREFIX}${sortedLayers[layerIdx]}`],
        });
      }
    }
  } else {
    // Без layer-данных: FIRST/LAST constraints
    for (const n of nodes) {
      const layoutOptions: Record<string, string> = {};
      const isSource = (inDeg.get(n.id) ?? 0) === 0;
      const isSink = (outDeg.get(n.id) ?? 0) === 0;
      if (isSource) {
        layoutOptions["elk.layered.layering.layerConstraint"] = "FIRST";
      } else if (isSink) {
        layoutOptions["elk.layered.layering.layerConstraint"] = "LAST";
      }
      elkChildren.push({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layoutOptions,
      });
    }
  }

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.separateConnectedComponents": "false",
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
    children: elkChildren,
    edges: elkEdges,
  };

  const laid = await elk.layout(elkGraph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laid.children ?? []) {
    // Пропускаем anchor-узлы
    if (child.id.startsWith(ANCHOR_PREFIX)) continue;
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

  const layoutedNodes: CustomNode[] = nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: layoutedNodes, edges };
}
