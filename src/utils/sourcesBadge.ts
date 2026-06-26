// src/utils/sourcesBadge.ts
import type { SourcesPoolEntry } from "../store/types";

export type SourcesBadgeCounts = { up: number; down: number };

/**
 * Номера источников для бейджей узла ПО НАПРАВЛЕНИЯМ («↑ 📖 N» / «↓ 📖 N»).
 *
 * Бейдж показывается для любого продукта, у которого есть записи в `sourcesPool`
 * (пошаговый поиск, восстановленный из сейва или объединённый граф). Источники
 * целиком хранятся в node.data; пул держит нумерацию бейджа.
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
