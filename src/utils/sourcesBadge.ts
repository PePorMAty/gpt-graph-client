// src/utils/sourcesBadge.ts
import { normalizeProductName } from "./normalizeProductName";
import type { CustomNodeData } from "../types";
import type { SourcesPoolEntry, TechnologySource } from "../store/types";

export type SourcesBadgeCounts = { up: number; down: number };

/**
 * Числа разных продуктов-источников для бейджей узла ПО НАПРАВЛЕНИЯМ
 * (`↑ 📖 N` вверх / `↓ 📖 N` вниз). Источники вверх и вниз ищутся отдельно
 * (разные пулы и поля node.data), поэтому считаются независимо.
 *
 * Для каждого направления число = размер множества продуктов, для которых
 * реально делался запрос источников и чьи источники накоплены в узле в этом
 * направлении, дедуп по normalizeProductName:
 *   • пошаговый режим — набор originProducts из пула направления (если есть
 *     источники), с учётом наследования/добора по шагам;
 *   • whole-режим — сам узел как источник, если есть persisted-источники
 *     node.data.sourcesUp / sourcesDown соответствующего направления.
 *
 * Если в направлении источников нет — там 0 (бейдж не показывается).
 */
export function countProductSourcesByDirection(
  nodeData: CustomNodeData,
  poolDown: SourcesPoolEntry | undefined,
  poolUp: SourcesPoolEntry | undefined,
): SourcesBadgeCounts {
  const selfKey = normalizeProductName(String(nodeData.label ?? ""));

  const countDir = (
    entry: SourcesPoolEntry | undefined,
    wholeSources: TechnologySource[] | undefined,
  ): number => {
    const seen = new Set<string>();
    if (entry && entry.sources.length > 0) {
      const origins =
        entry.originProducts ??
        (entry.originProduct ? [entry.originProduct] : [entry.product]);
      for (const o of origins) {
        const key = normalizeProductName(String(o ?? ""));
        if (key) seen.add(key);
      }
    }
    // whole-режим: собственные persisted-источники узла → он сам как origin.
    if (selfKey && (wholeSources?.length ?? 0) > 0) seen.add(selfKey);
    return seen.size;
  };

  return {
    up: countDir(poolUp, nodeData.sourcesUp),
    down: countDir(poolDown, nodeData.sourcesDown),
  };
}
