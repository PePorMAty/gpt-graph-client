// src/utils/mergeSourcesPools.ts
import type { SavedSourcesBlock } from "../store/types";
import { sourcesContentKey } from "./sourcesContentKey";

/**
 * Объединяет несколько блоков источников с ПЕРЕНУМЕРАЦИЕЙ ПО НАПРАВЛЕНИЯМ, чтобы
 * номера бейджа «📖 N» не повторялись между графами.
 *
 * Ключевой момент: номер идентифицирует НАБОР источников, а не продукт. Несколько
 * продуктов могут делить одни источники (потомок взял «взаймы» у предка) — у них
 * один номер. Поэтому нумеруем по уникальному содержимому источников
 * (`sourcesContentKey`), а не по каждой записи пула: продукты с одинаковыми
 * источниками (в т.ч. из разных графов) получают ОДИН номер, и максимальный номер
 * равен числу различных наборов источников, а не числу продуктов.
 *
 * Блоки берутся по порядку; внутри направления номера выдаются по первому
 * появлению нового набора. Записи без источников номер не получают (как в живом
 * пуле). Дублирующийся product+direction (общий узел между графами) берётся один.
 */
export function mergeSourcesPools(
  blocks: SavedSourcesBlock[],
): SavedSourcesBlock {
  const combined: SavedSourcesBlock = {
    pool: {},
    seqCounter: { up: 0, down: 0 },
  };
  // Набор источников → выданный номер, раздельно по направлениям.
  const contentToSeq = {
    up: new Map<string, number>(),
    down: new Map<string, number>(),
  };

  const dirOfKey = (key: string): "up" | "down" =>
    key.endsWith("::up") ? "up" : "down";

  for (const block of blocks) {
    if (!block?.pool) continue;
    // Записи блока в порядке их собственных номеров — чтобы перенос сохранял
    // относительный порядок наборов внутри направления.
    const entries = Object.entries(block.pool).sort(
      ([, a], [, b]) => (a.seq ?? Infinity) - (b.seq ?? Infinity),
    );
    for (const [key, entry] of entries) {
      if (combined.pool[key]) continue; // общий узел между графами — один
      const dir = dirOfKey(key);
      if (!entry.sources || entry.sources.length === 0) {
        // Источников нет — номер не выдаём (бейдж и так не показывается).
        combined.pool[key] = { ...entry };
        continue;
      }
      const contentKey = sourcesContentKey(entry.sources);
      const seen = contentToSeq[dir].get(contentKey);
      let seq: number;
      if (seen != null) {
        seq = seen; // тот же набор источников — тот же номер
      } else {
        combined.seqCounter[dir] += 1;
        seq = combined.seqCounter[dir];
        contentToSeq[dir].set(contentKey, seq);
      }
      combined.pool[key] = { ...entry, seq };
    }
  }

  return combined;
}
