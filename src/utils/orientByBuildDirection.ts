// src/utils/orientByBuildDirection.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

type Dir = "up" | "down";

/**
 * Идемпотентно приводит рёбра объединённого графа к канону «сырьё → продукт»
 * (по ходу производства, сверху вниз).
 *
 * Зачем именно идемпотентно: step-билдеры создают рёбра `якорь →
 * преобразование → новый-узел`, не переворачивая source/target по направлению.
 * У «вниз»-графа якорь — конечный продукт, поэтому рёбра топологически
 * перевёрнуты (продукт→сырьё) относительно «вверх»-графов и продуктовых графов
 * (сырьё→продукт). Нужно привести всё к одному канону.
 *
 * Ориентацию КАЖДОГО ребра вычисляем из СТАБИЛЬНОЙ структуры, не зависящей от
 * текущего направления рёбер: ненаправленное расстояние конца до корня цепочки
 * (`data.chainRootNodeId`) + направление сборки (`data.chainDirection`). Поэтому
 * повторное применение к уже-канональным рёбрам — no-op (нет тоггла и флага):
 * функция самовосстанавливается на любых входных рёбрах (нативных,
 * ранее-развёрнутых, из старых сохранений), что чинит переворот при повторном
 * объединении.
 *
 * Корень «вниз»-цепочки — это конечный продукт (исходный узел, от которого
 * строили): сырьё дальше всего от него. Корень «вверх»-цепочки — входное сырьё:
 * оно ближе всего к корню. Так в обоих случаях source = сырьё, target = продукт.
 */
export function orientByBuildDirection(
  nodes: CustomNode[],
  edges: Edge[],
): Edge[] {
  if (edges.length === 0) return edges;

  const idSet = new Set(nodes.map((n) => n.id));
  const dirOf = new Map<string, Dir | undefined>();
  const rootOf = new Map<string, string | undefined>();
  for (const n of nodes) {
    dirOf.set(n.id, n.data?.chainDirection as Dir | undefined);
    rootOf.set(n.id, n.data?.chainRootNodeId as string | undefined);
  }

  // Ненаправленная смежность (направление рёбер тут НЕ важно — оно и есть то,
  // что мы пересчитываем).
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  // Корни цепочек = все встречающиеся chainRootNodeId.
  const roots = new Set<string>();
  for (const n of nodes) {
    const r = rootOf.get(n.id);
    if (r && idSet.has(r)) roots.add(r);
  }
  if (roots.size === 0) return edges; // нет step-цепочек — трогать нечего

  const bfsFrom = (root: string): Map<string, number> => {
    const d = new Map<string, number>([[root, 0]]);
    const q = [root];
    for (let i = 0; i < q.length; i++) {
      const cd = d.get(q[i])!;
      for (const nb of adj.get(q[i]) ?? []) {
        if (!d.has(nb)) {
          d.set(nb, cd + 1);
          q.push(nb);
        }
      }
    }
    return d;
  };
  const distByRoot = new Map<string, Map<string, number>>();
  for (const root of roots) distByRoot.set(root, bfsFrom(root));

  // Расстояние узла до СВОЕГО корня; иначе — до ближайшего корня (фолбэк для
  // редких стыковых узлов без собственного корня в составе компоненты).
  const distOf = (id: string): number | undefined => {
    const own = rootOf.get(id);
    if (own && distByRoot.get(own)?.has(id)) return distByRoot.get(own)!.get(id);
    let best: number | undefined;
    for (const dmap of distByRoot.values()) {
      const v = dmap.get(id);
      if (v != null && (best == null || v < best)) best = v;
    }
    return best;
  };

  return edges.map((e) => {
    const du = dirOf.get(e.source);
    const dv = dirOf.get(e.target);
    const touchesDown = du === "down" || dv === "down";
    const touchesUp = du === "up" || dv === "up";

    // Класс ребра. Стык up↔down и продуктовые графы (нет направления) не трогаем.
    let edgeDir: Dir | null = null;
    if (touchesDown && !touchesUp) edgeDir = "down";
    else if (touchesUp && !touchesDown) edgeDir = "up";
    if (edgeDir === null) return e;

    const distU = distOf(e.source);
    const distV = distOf(e.target);
    if (distU == null || distV == null || distU === distV) return e;

    // Сырьё (source) — конец дальше от продукта:
    //  • down: корень = продукт → сырьё имеет БОЛЬШИЙ dist;
    //  • up:   корень = сырьё   → сырьё имеет МЕНЬШИЙ dist.
    const sourceIsU = edgeDir === "down" ? distU > distV : distU < distV;
    const newSource = sourceIsU ? e.source : e.target;
    const newTarget = sourceIsU ? e.target : e.source;
    if (newSource === e.source && newTarget === e.target) return e;

    // Хэндлы перевыставит applyHandlesByGeometry после раскладки.
    return { ...e, source: newSource, target: newTarget };
  });
}
