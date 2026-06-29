// src/utils/collapseDuplicateAlternatives.ts
//
// Схлопывание ДУБЛЕЙ АЛЬТЕРНАТИВ при объединении графов. Зеркалит логику
// схлопывания общих продуктов в mergeProductGraph: одинаковые alt-узлы
// (вариант шага) от одного и того же продукта сливаем в один.
//
// Alt-узел — это transformation-нода с data.chainVariant === "alt", несущая
// data.chainRootNodeId (продукт-анкор) и data.stepAltDirection ("up"|"down").
// Две альтернативы считаем одинаковыми, если у них совпадают:
//   (1) анкор-продукт (chainRootNodeId, уже ремапнутый на общий узел),
//   (2) направление (stepAltDirection),
//   (3) «суть» варианта — alternativeKey по набору входов/выходов из описания.
// Применять ПОСЛЕ схлопывания продуктов и ремапа chainRootNodeId (иначе альты
// от ставшего общим продукта не сгруппируются).

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { alternativeKey } from "./parseAlternatives";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function collapseDuplicateAlternatives(
  nodes: CustomNode[],
  edges: Edge[],
): { nodes: CustomNode[]; edges: Edge[] } {
  const idRemap: Record<string, string> = {};
  const keptByGroup = new Map<string, string>();
  const dropped = new Set<string>();

  for (const n of nodes) {
    if (n.type !== "transformation") continue;
    if (n.data?.chainVariant !== "alt") continue;
    const root = str(n.data?.chainRootNodeId);
    if (!root) continue; // без анкора группировать нельзя — оставляем как есть
    const dir = str(n.data?.stepAltDirection);
    const content = alternativeKey({
      fullDescription: str(n.data?.description),
      title: str(n.data?.label),
    });
    if (!content) continue; // суть не определена — не рискуем схлопывать
    const groupKey = `${root}::${dir}::${content}`;
    const kept = keptByGroup.get(groupKey);
    if (kept) {
      idRemap[n.id] = kept;
      dropped.add(n.id);
    } else {
      keptByGroup.set(groupKey, n.id);
    }
  }

  if (dropped.size === 0) return { nodes, edges };

  const keptNodes = nodes.filter((n) => !dropped.has(n.id));

  // Ремап рёбер на оставшийся alt-узел + дедуп по паре source->target
  // (рёбра «продукт → дубль-альт» после ремапа совпадут с ребром к оставшемуся).
  const seenPair = new Set<string>();
  const keptEdges: Edge[] = [];
  for (const e of edges) {
    const source = idRemap[e.source] ?? e.source;
    const target = idRemap[e.target] ?? e.target;
    if (source === target) continue;
    const pair = `${source}->${target}`;
    if (seenPair.has(pair)) continue;
    seenPair.add(pair);
    keptEdges.push(source === e.source && target === e.target ? e : { ...e, source, target });
  }

  return { nodes: keptNodes, edges: keptEdges };
}
