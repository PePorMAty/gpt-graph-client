// src/utils/reconstructSourcesPool.ts
import { normalizeProductName } from "./normalizeProductName";
import { sourcesContentKey } from "./sourcesContentKey";
import type { CustomNode } from "../types";
import type { SavedSourcesBlock, SourcesPoolEntry } from "../store/types";

// Должен совпадать с sourcesPoolKey в gptSlice (импортируем normalizeProductName
// напрямую, чтобы не создавать циклическую зависимость с gptSlice).
const poolKey = (label: string, dir: "up" | "down") =>
  `${normalizeProductName(label)}::${dir}`;

/**
 * Реконструирует пул источников и счётчики номеров бейджа из понодовых данных
 * (`data.sourcesUp` / `data.sourcesDown`). Нужен для старых сохранённых графов,
 * в которых нет блока `state.sources`, а также как фолбэк при загрузке.
 *
 * Номер бейджа «📖 N» (`seq`) идентифицирует НАБОР источников, а не продукт:
 * продукты с одинаковыми источниками (потомок взял «взаймы» у предка) делят один
 * номер. Поэтому нумеруем ПО НАПРАВЛЕНИЯМ уникальные наборы источников
 * (`sourcesContentKey`) в порядке первого появления (по `sources_meta.fetchedAt`,
 * фолбэк — порядок узлов). Ключ пула — `poolKey(label, direction)`, как в живом
 * пуле, поэтому бейдж в `Flow.tsx` подхватит записи без изменений.
 */
export function reconstructSourcesPool(nodes: CustomNode[]): SavedSourcesBlock {
  const pool: Record<string, SourcesPoolEntry> = {};
  const seqCounter = { up: 0, down: 0 };

  type Draft = {
    key: string;
    fetchedAt: string;
    order: number;
    contentKey: string;
  };

  const assign = (dir: "up" | "down") => {
    const field = dir === "up" ? "sourcesUp" : "sourcesDown";
    const drafts: Draft[] = [];
    nodes.forEach((n, order) => {
      if (n.type !== "product") return;
      const label = typeof n.data?.label === "string" ? n.data.label : "";
      if (!label) return;
      const sources = n.data?.[field];
      if (!Array.isArray(sources) || sources.length === 0) return;
      const key = poolKey(label, dir);
      if (pool[key]) return; // один продукт+направление — одна запись
      const fetchedAt = n.data?.sources_meta?.fetchedAt ?? "";
      pool[key] = {
        sources: [...sources],
        product: label,
        originProduct: label,
        lastFetchedAt: fetchedAt,
      };
      drafts.push({
        key,
        fetchedAt,
        order,
        contentKey: sourcesContentKey(sources),
      });
    });

    // Порядок: по времени поиска, затем по порядку узлов (стабильно).
    drafts.sort(
      (a, b) =>
        (a.fetchedAt < b.fetchedAt ? -1 : a.fetchedAt > b.fetchedAt ? 1 : 0) ||
        a.order - b.order,
    );

    // Один номер на уникальный набор источников.
    const contentToSeq = new Map<string, number>();
    drafts.forEach((d) => {
      const seen = contentToSeq.get(d.contentKey);
      if (seen != null) {
        pool[d.key].seq = seen;
      } else {
        seqCounter[dir] += 1;
        contentToSeq.set(d.contentKey, seqCounter[dir]);
        pool[d.key].seq = seqCounter[dir];
      }
    });
  };

  assign("up");
  assign("down");

  return { pool, seqCounter };
}
