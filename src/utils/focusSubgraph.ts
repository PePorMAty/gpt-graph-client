// src/utils/focusSubgraph.ts
//
// Окрестность фокус-узла для фокус-режима (навигация «как в TheBrain»):
// от центра видно N шагов вперёд (по исходящим рёбрам) и N шагов назад
// (по входящим), клик по видимому продукту делает его новым центром.
//
// «Шаг» считается по продуктам: transformation-ноды проходятся бесплатно и
// включаются вместе с продуктами по ту сторону — как в extractSubgraph.
// В отличие от extractSubgraph НЕ предполагает строгого чередования
// product → transformation → product: прямые рёбра продукт→продукт
// (объединённые графы, режим «только продукты» при сохранении) тоже
// считаются одним шагом, alt-ноды ведут себя как обычные соседи.

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/**
 * Охват окрестности фокус-режима:
 *  • steps — N шагов в обе стороны (стандарт, N = 1..3);
 *  • neighbors — только родители и дети узла (входящие/исходящие продукты,
 *    эквивалент одного шага);
 *  • chain — вся цепочка узла: все предки и потомки без ограничения глубины,
 *    но НЕ весь граф (несвязанные с узлом ветки не показываются).
 */
export type FocusScope = "steps" | "neighbors" | "chain";

/** Глубина обхода для заданного охвата. Бесконечность безопасна:
 *  buildFocusSubgraph дедуплицирует посещения и завершится, обойдя всё
 *  достижимое от фокуса. */
export function focusScopeDepth(scope: FocusScope, stepsDepth: number): number {
  if (scope === "neighbors") return 1;
  if (scope === "chain") return Number.POSITIVE_INFINITY;
  return stepsDepth;
}

export type FocusSubgraphResult = {
  nodes: CustomNode[];
  edges: Edge[];
  /**
   * Число «обрезанных» связей по видимым узлам: сколько рёбер ведёт из узла
   * к узлам ЗА границей окрестности. Для бейджа «+N» на крайних продуктах —
   * подсказка, что за ними есть продолжение и туда можно шагнуть.
   */
  moreCountByNodeId: Record<string, number>;
};

export function buildFocusSubgraph(
  nodes: CustomNode[],
  edges: Edge[],
  focusId: string,
  depth: number,
): FocusSubgraphResult {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    const o = outAdj.get(e.source);
    if (o) o.push(e.target);
    else outAdj.set(e.source, [e.target]);
    const i = inAdj.get(e.target);
    if (i) i.push(e.source);
    else inAdj.set(e.target, [e.source]);
  }

  const allowed = new Set<string>([focusId]);

  // BFS по одному направлению. level — сколько продуктовых шагов уже сделано
  // до текущего узла. Из продукта уровня level >= depth дальше не идём;
  // transformation не тратит шаг и включается только вместе со своим
  // продолжением (та же семантика границы, что у extractSubgraph).
  const walk = (adj: Map<string, string[]>) => {
    // Лучший (минимальный) достигнутый уровень узла — BFS обходит по слоям,
    // так что первый визит и есть минимум; повторные визиты отсекаем.
    const bestLevel = new Map<string, number>([[focusId, 0]]);
    const queue: Array<{ id: string; level: number }> = [
      { id: focusId, level: 0 },
    ];

    while (queue.length) {
      const { id, level } = queue.shift()!;
      if (level >= depth) continue;

      for (const nextId of adj.get(id) ?? []) {
        const next = nodeMap.get(nextId);
        if (!next) continue;
        // transformation бесплатна (уровень не растёт), любой другой тип
        // узла (product, alt и т.п.) — полноценный шаг.
        const nextLevel =
          next.type === "transformation" ? level : level + 1;
        const prev = bestLevel.get(nextId);
        if (prev !== undefined && prev <= nextLevel) continue;
        bestLevel.set(nextId, nextLevel);
        allowed.add(nextId);
        queue.push({ id: nextId, level: nextLevel });
      }
    }
  };

  walk(outAdj);
  walk(inAdj);

  const subEdges = edges.filter(
    (e) => allowed.has(e.source) && allowed.has(e.target),
  );

  // Сколько связей каждого видимого узла обрезано границей окрестности.
  const moreCountByNodeId: Record<string, number> = {};
  for (const e of edges) {
    if (allowed.has(e.source) && !allowed.has(e.target)) {
      moreCountByNodeId[e.source] = (moreCountByNodeId[e.source] ?? 0) + 1;
    } else if (allowed.has(e.target) && !allowed.has(e.source)) {
      moreCountByNodeId[e.target] = (moreCountByNodeId[e.target] ?? 0) + 1;
    }
  }

  return {
    nodes: nodes.filter((n) => allowed.has(n.id)),
    edges: subEdges,
    moreCountByNodeId,
  };
}
