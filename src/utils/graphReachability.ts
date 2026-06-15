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

/**
 * Метки продуктов-предков узла `nodeId` (вся родословная ВЫШЕ по построению,
 * от корня до родителя). Идём по рёбрам в обратную сторону target → source
 * через узлы-трансформации, собираем только product-узлы.
 *
 * Нужна серверной проверке достаточности: следующий передел дочернего продукта
 * не должен вести ОБРАТНО к предку (это замкнуло бы цикл).
 */
export function getAncestorProductLabels(
  nodeId: string,
  nodes: ReadonlyArray<{ id: string; type?: string; data?: { label?: string } }>,
  edges: ReadonlyArray<Edge>,
): string[] {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const arr = incoming.get(e.target);
    if (arr) arr.push(e.source);
    else incoming.set(e.target, [e.source]);
  }

  const info = new Map<string, { label: string; type?: string }>();
  for (const n of nodes) {
    info.set(n.id, { label: String(n.data?.label || "").trim(), type: n.type });
  }

  const visited = new Set<string>([nodeId]);
  const stack: string[] = [nodeId];
  const labels: string[] = [];
  while (stack.length) {
    const cur = stack.pop() as string;
    const parents = incoming.get(cur);
    if (!parents) continue;
    for (const p of parents) {
      if (visited.has(p)) continue;
      visited.add(p);
      stack.push(p);
      const meta = info.get(p);
      if (meta?.type === "product" && meta.label) labels.push(meta.label);
    }
  }
  return labels;
}
