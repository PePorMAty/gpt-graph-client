import type { Edge } from "@xyflow/react";

/**
 * Возвращает множество id узлов, достижимых из `centerId` по рёбрам
 * в обе стороны в пределах `maxDepth` шагов (предки + потомки + сам центр).
 *
 * `maxDepth = 1` (по умолчанию) — только прямые входящие и исходящие
 * соседи: то, что чаще всего нужно для подсветки «с кем связан этот узел».
 * Полный обход цепочки даёт слишком широкую подсветку — на больших
 * объединённых графах это часто почти всё дерево.
 *
 * В отличие от {@link extractSubgraph} не требует чередования
 * product → transformation → product — рассчитан на произвольные DAG.
 */
export function findChainNodeIds(
  edges: Edge[],
  centerId: string,
  maxDepth: number = 1,
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

  const visited = new Set<string>([centerId]);
  let frontier: string[] = [centerId];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of [...(outAdj.get(id) ?? []), ...(inAdj.get(id) ?? [])]) {
        if (visited.has(n)) continue;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return visited;
}
