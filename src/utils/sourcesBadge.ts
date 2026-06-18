// src/utils/sourcesBadge.ts
import type { SourcesPoolEntry } from "../store/types";

export type SourcesBadgeCounts = { up: number; down: number };

/**
 * Номера источников для бейджей узла ПО НАПРАВЛЕНИЯМ («↑ 📖 N» / «↓ 📖 N»).
 *
 * Бейдж показывается ТОЛЬКО для пошагового режима (источники в `sourcesPool`);
 * для построения полной цепочки (whole-режим, источники в node.data) бейдж не
 * выводится, чтобы не перегружать вид ноды.
 *
 * Номер — глобальный сквозной порядковый номер поиска (per-direction): каждый
 * новый поиск по графу получает следующий номер, унаследованные продукты
 * показывают номер своего продукта-источника. Если в направлении нет пула с
 * источниками — 0 (бейдж не показывается).
 */
export function countProductSourcesByDirection(
  poolDown: SourcesPoolEntry | undefined,
  poolUp: SourcesPoolEntry | undefined,
): SourcesBadgeCounts {
  const seqForDir = (entry: SourcesPoolEntry | undefined): number =>
    entry && entry.sources.length > 0 ? (entry.seq ?? 1) : 0;

  return {
    up: seqForDir(poolUp),
    down: seqForDir(poolDown),
  };
}
