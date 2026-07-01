// src/utils/assignTopologicalLayers.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/**
 * Проставляет `data.layer` каждому узлу = глубина самого длинного пути от
 * топологических истоков (узлов без входящих рёбер). Слои считаются по ВСЕМУ
 * переданному графу единообразно, что даёт чистое послойное размещение в
 * `layoutMergedGraphElk` (`useLayers: true`) независимо от того, нёс ли
 * исходный JSON поле «Слой».
 *
 * Это снимает ту разнородность `«Слой»`, из-за которой layer-aware layout
 * во вкладке объединения был отключён: теперь слой есть у каждого узла и
 * вычисляется по фактической топологии объединённого графа.
 *
 * Cycle-safe: при наличии циклов (бывают при схождении DAG в step-графах)
 * число релаксаций ограничено количеством узлов, поэтому функция всегда
 * завершается, а узлы цикла получают ограниченный конечный слой.
 */
export function assignTopologicalLayers(
  nodes: CustomNode[],
  edges: Edge[],
): CustomNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  );

  const layer = new Map<string, number>();
  for (const n of nodes) layer.set(n.id, 0);

  // Longest-path релаксация (Bellman-Ford-стиль). Для DAG сходится за
  // ≤ N-1 проходов; cap в N проходов гарантирует завершение на циклах.
  const maxPasses = nodes.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const e of validEdges) {
      const su = layer.get(e.source) ?? 0;
      const tv = layer.get(e.target) ?? 0;
      if (tv < su + 1) {
        layer.set(e.target, su + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return nodes.map((n) => ({
    ...n,
    data: { ...n.data, layer: layer.get(n.id) ?? 0 },
  }));
}
