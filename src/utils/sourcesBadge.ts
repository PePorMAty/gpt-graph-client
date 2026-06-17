// src/utils/sourcesBadge.ts
import type { CustomNodeData } from "../types";
import type { SourcesPoolEntry, TechnologySource } from "../store/types";

export type SourcesBadgeCounts = { up: number; down: number };

/**
 * Номера источников для бейджей узла ПО НАПРАВЛЕНИЯМ («↑ 📖 N» / «↓ 📖 N»).
 *
 * Номер — глобальный сквозной порядковый номер поиска (per-direction), а не
 * количество источников: каждый новый поиск по графу получает следующий номер,
 * унаследованные продукты показывают номер своего продукта-источника.
 *
 * Для направления номер берётся:
 *   • пошаговый режим — `seq` из пула направления (если есть источники);
 *   • whole-режим — `node.data.sourcesSeqUp/Down` (если есть persisted-источники);
 *     для старых графов без номера — запасное 1.
 * Если источников в направлении нет — 0 (бейдж не показывается).
 */
export function countProductSourcesByDirection(
  nodeData: CustomNodeData,
  poolDown: SourcesPoolEntry | undefined,
  poolUp: SourcesPoolEntry | undefined,
): SourcesBadgeCounts {
  const seqForDir = (
    entry: SourcesPoolEntry | undefined,
    wholeSources: TechnologySource[] | undefined,
    wholeSeq: number | undefined,
  ): number => {
    if (entry && entry.sources.length > 0) return entry.seq ?? 1;
    if ((wholeSources?.length ?? 0) > 0) return wholeSeq ?? 1;
    return 0;
  };

  return {
    up: seqForDir(poolUp, nodeData.sourcesUp, nodeData.sourcesSeqUp),
    down: seqForDir(poolDown, nodeData.sourcesDown, nodeData.sourcesSeqDown),
  };
}
