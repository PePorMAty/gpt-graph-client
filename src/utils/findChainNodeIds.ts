import type { Edge } from "@xyflow/react";

/**
 * Возвращает множество id всех узлов, достижимых из `centerId`
 * по рёбрам в обе стороны (предки + потомки + сам центр).
 *
 * В отличие от {@link extractSubgraph} НЕ требует чередования
 * product → transformation → product и не ограничен глубиной —
 * подходит для произвольных DAG, какими получаются объединённые
 * графы во вкладке «Объединение графов» (там бывают прямые
 * рёбра product → product).
 *
 * Используется для подсветки цепочки по hover.
 */
export function findChainNodeIds(
  edges: Edge[],
  centerId: string,
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
  const stack: string[] = [centerId];
  while (stack.length) {
    const id = stack.pop()!;
    const next = [...(outAdj.get(id) ?? []), ...(inAdj.get(id) ?? [])];
    for (const n of next) {
      if (visited.has(n)) continue;
      visited.add(n);
      stack.push(n);
    }
  }
  return visited;
}
