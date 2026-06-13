// src/utils/graphReachability.ts
//
// Достижимость по направленному графу шагов. Рёбра step-by-step всегда идут
// anchor → transformation → product (см. stepToFlow), поэтому обычный обход
// по source → target честно отражает сохранённую топологию графа.
//
// Используется для ТОЧНОГО детекта петель: «выход совпал с существующим узлом»
// само по себе НЕ цикл — при построении вниз продукт-сырьё законно питает
// несколько потомков (DAG со схождением). Настоящая петля — только если новый
// узел уже ДОСТИЖИМ до якоря (т.е. является его предком): тогда добавление
// ребра anchor → tr → O замыкает направленный контур.

import type { Edge } from "@xyflow/react";

/**
 * Можно ли из `fromId` дойти до `toId`, двигаясь по рёбрам source → target.
 */
export function canReachNode(
  fromId: string,
  toId: string,
  edges: ReadonlyArray<Edge>,
): boolean {
  if (fromId === toId) return true;

  const out = new Map<string, string[]>();
  for (const e of edges) {
    const arr = out.get(e.source);
    if (arr) arr.push(e.target);
    else out.set(e.source, [e.target]);
  }

  const visited = new Set<string>([fromId]);
  const stack: string[] = [fromId];
  while (stack.length) {
    const cur = stack.pop() as string;
    const next = out.get(cur);
    if (!next) continue;
    for (const n of next) {
      if (n === toId) return true;
      if (!visited.has(n)) {
        visited.add(n);
        stack.push(n);
      }
    }
  }
  return false;
}

/**
 * Замкнёт ли петлю добавление шага anchor → tr → existingNodeId.
 * Истина, только если existingNodeId уже достигает anchorNodeId по текущим
 * рёбрам (existingNodeId — предок anchor).
 */
export function wouldCreateCycle(
  existingNodeId: string,
  anchorNodeId: string,
  edges: ReadonlyArray<Edge>,
): boolean {
  if (!existingNodeId || existingNodeId === anchorNodeId) return false;
  return canReachNode(existingNodeId, anchorNodeId, edges);
}
