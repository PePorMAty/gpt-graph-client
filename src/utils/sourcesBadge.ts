// src/utils/sourcesBadge.ts
import { normalizeProductName } from "./normalizeProductName";
import type { CustomNodeData } from "../types";
import type { SourcesPoolEntry } from "../store/types";

/**
 * Сколько РАЗНЫХ продуктов-источников держит узел-продукт (для бейджа «📖 N»).
 *
 * Число = размер множества продуктов, для которых реально делался запрос
 * источников и чьи источники накоплены в этом узле, дедуплицированного по
 * normalizeProductName:
 *   • пошаговый режим — наборы originProducts из пула по обоим направлениям
 *     (с учётом наследования/добора по шагам); учитываются только пулы,
 *     где реально есть источники;
 *   • whole-режим — сам узел как источник, если у него есть persisted-источники
 *     node.data.sourcesDown / sourcesUp.
 *
 * Пустое множество → бейдж не показывается (возвращает 0).
 */
export function countProductSources(
  nodeData: CustomNodeData,
  poolDown: SourcesPoolEntry | undefined,
  poolUp: SourcesPoolEntry | undefined,
): number {
  const seen = new Set<string>();

  const addPool = (entry?: SourcesPoolEntry) => {
    if (!entry || entry.sources.length === 0) return;
    const origins =
      entry.originProducts ??
      (entry.originProduct ? [entry.originProduct] : [entry.product]);
    for (const o of origins) {
      const key = normalizeProductName(String(o ?? ""));
      if (key) seen.add(key);
    }
  };

  addPool(poolDown);
  addPool(poolUp);

  // whole-режим: собственные persisted-источники узла → он сам как origin.
  const selfKey = normalizeProductName(String(nodeData.label ?? ""));
  if (selfKey) {
    if ((nodeData.sourcesDown?.length ?? 0) > 0) seen.add(selfKey);
    if ((nodeData.sourcesUp?.length ?? 0) > 0) seen.add(selfKey);
  }

  return seen.size;
}
