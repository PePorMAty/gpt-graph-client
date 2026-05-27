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

/**
 * ELK layered layout специально для вкладки «Объединение графов».
 *
 * Если узлы содержат `data.layer` (число — номер слоя из JSON),
 * используется стратегия `INTERACTIVE` c `layerId` — ELK раскладывает
 * узлы строго по заданным слоям, а внутри слоя минимизирует пересечения.
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
  if (!hasLayerData) {
    for (const n of nodes) {
      inDeg.set(n.id, 0);
      outDeg.set(n.id, 0);
    }
    for (const e of validEdges) {
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    }
  }

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.layering.strategy": hasLayerData
        ? "INTERACTIVE"
        : "LONGEST_PATH",
      "elk.separateConnectedComponents": hasLayerData ? "false" : "true",
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
    children: nodes.map((n) => {
      const layoutOptions: Record<string, string> = {};
      const layer = (n.data as Record<string, unknown>)?.layer;

      if (hasLayerData && typeof layer === "number") {
        layoutOptions["org.eclipse.elk.layered.layering.layerId"] =
          String(layer);
      } else if (!hasLayerData) {
        const isSource = (inDeg.get(n.id) ?? 0) === 0;
        const isSink = (outDeg.get(n.id) ?? 0) === 0;
        if (isSource) {
          layoutOptions["elk.layered.layering.layerConstraint"] = "FIRST";
        } else if (isSink) {
          layoutOptions["elk.layered.layering.layerConstraint"] = "LAST";
        }
      }

      return {
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layoutOptions,
      };
    }),
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

  const layoutedNodes: CustomNode[] = nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: layoutedNodes, edges };
}
