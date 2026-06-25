// src/utils/mergeSourcesPools.ts
import type { SavedSourcesBlock } from "../store/types";

/**
 * Объединяет несколько блоков источников с ПЕРЕНУМЕРАЦИЕЙ ПО НАПРАВЛЕНИЯМ, чтобы
 * номера бейджа «📖 N» не повторялись между графами.
 *
 * Блоки берутся по порядку. Внутри каждого направления (↑/↓) записи первого блока
 * сохраняют свои номера; записи последующих блоков, если их ключ ещё не встречался
 * (новый продукт), получают следующий номер сквозного счётчика этого направления.
 * Общий продукт (одинаковый ключ = нормализованный label) держит ОДИН номер —
 * берётся уже добавленный. Так у второго графа «1» становится N+1 и т.д., а итог
 * счётчика — общее количество уникальных пронумерованных продуктов в направлении.
 *
 * Ключи пула — по нормализованному label, поэтому переживают namespacing id и
 * совпадают со схлопыванием общих продуктов в `mergeProductGraph`.
 */
export function mergeSourcesPools(
  blocks: SavedSourcesBlock[],
): SavedSourcesBlock {
  const combined: SavedSourcesBlock = {
    pool: {},
    seqCounter: { up: 0, down: 0 },
  };

  const dirOfKey = (key: string): "up" | "down" =>
    key.endsWith("::up") ? "up" : "down";

  for (const block of blocks) {
    if (!block?.pool) continue;
    // Записи блока в порядке их собственных номеров — чтобы перенос сохранял
    // относительный порядок продуктов внутри направления.
    const entries = Object.entries(block.pool).sort(
      ([, a], [, b]) => (a.seq ?? Infinity) - (b.seq ?? Infinity),
    );
    for (const [key, entry] of entries) {
      if (combined.pool[key]) continue; // общий продукт — один номер
      const dir = dirOfKey(key);
      combined.seqCounter[dir] += 1;
      combined.pool[key] = { ...entry, seq: combined.seqCounter[dir] };
    }
  }

  return combined;
}
