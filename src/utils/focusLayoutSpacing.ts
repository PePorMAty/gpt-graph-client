// src/utils/focusLayoutSpacing.ts
//
// Зазоры раскладки окрестности в фокус-режиме.
//
// Камера вписывает всю окрестность в экран, поэтому зазоры и масштаб связаны
// напрямую: чем больше рядов в окрестности, тем сильнее камера отъезжает и тем
// мельче подписи. Одни и те же зазоры на всех глубинах означают, что 3 уровня
// показываются той же «сеткой», что и 1, — только вчетверо мельче. Поэтому с
// ростом окрестности узлы ставятся плотнее: место отбирается у пустот, а не у
// текста.
//
// Ступень выбирается по числу РЯДОВ будущей раскладки, а не по номеру глубины:
// у «Цепочки» глубина не задана вовсе, а короткая ветка вверх на трёх шагах
// даёт всего пару рядов — прижимать её незачем.
//
// Габарит узла считается поимённо (estimateNodeSize), а не одной константой на
// всех: подпись в две строки выше на строку, и общая «ячейка» съедала бы
// просвет. С поимённым замером rankSep — настоящий видимый просвет.

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { estimateNodeSize } from "../components/nodes/nodeBox";
import { countLayoutRanks, type LayoutSpacing } from "./layoutTree";

/** Ступени: до скольки рядов действует зазор между рядами и между соседями. */
const TIERS: Array<{ maxRanks: number; rankSep: number; nodeSep: number }> = [
  { maxRanks: 5, rankSep: 56, nodeSep: 64 },
  { maxRanks: 9, rankSep: 40, nodeSep: 56 },
  { maxRanks: 13, rankSep: 30, nodeSep: 48 },
  { maxRanks: Infinity, rankSep: 24, nodeSep: 44 },
];

export function focusLayoutSpacing(
  nodes: CustomNode[],
  edges: Edge[],
): LayoutSpacing {
  const ranks = countLayoutRanks(nodes, edges);
  const tier = TIERS.find((t) => ranks <= t.maxRanks) ?? TIERS[TIERS.length - 1];
  return {
    rankSep: tier.rankSep,
    nodeSep: tier.nodeSep,
    measure: (node: CustomNode) =>
      estimateNodeSize(String(node.data?.label ?? ""), true),
  };
}
