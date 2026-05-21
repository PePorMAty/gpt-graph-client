import type { Edge } from "@xyflow/react";

/**
 * Возвращает множество id узлов вокруг `centerId`:
 *  • сам центр + его прямые входящие/исходящие соседи (depth 1);
 *  • для каждого соседа-`transformation` дополнительно добавляются
 *    его соседи — чтобы из продукта была видна не только сама
 *    стрелка преобразования, но и продукт по ту сторону этой
 *    стрелки. Прямые `product → product` рёбра ведут себя как
 *    обычные соседи.
 *
 * `nodeTypeOf` опционально — если не задан, ведём себя как простой
 * BFS глубины 1.
 *
 * В отличие от {@link extractSubgraph} ничего не предполагает о
 * чередовании типов и подходит для произвольных DAG из объединённой
 * вкладки.
 */
export function findChainNodeIds(
  edges: Edge[],
  centerId: string,
  nodeTypeOf?: (id: string) => string | undefined,
): Set<string> {
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const e of edges) {
    const o = outAdj.get(e.source);
    if (o) o.push(e.target);
    else outAdj.set(e.source, [e.target]);
    const i = inAdj.get(e.target);
    if (i) i.push(e.source);
    else inAdj.set(e.target, [e.source]);
  }

  const neighborsOf = (id: string) => [
    ...(outAdj.get(id) ?? []),
    ...(inAdj.get(id) ?? []),
  ];

  const visited = new Set<string>([centerId]);
  const directNeighbors = neighborsOf(centerId);
  for (const n of directNeighbors) visited.add(n);

  if (nodeTypeOf) {
    for (const id of directNeighbors) {
      if (nodeTypeOf(id) !== "transformation") continue;
      for (const n of neighborsOf(id)) visited.add(n);
    }
  }

  return visited;
}
