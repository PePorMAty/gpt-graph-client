// src/utils/reconstructSourcesPool.ts
import { normalizeProductName } from "./normalizeProductName";
import type { CustomNode } from "../types";
import type { SavedSourcesBlock, SourcesPoolEntry } from "../store/types";

// Должен совпадать с sourcesPoolKey в gptSlice (импортируем normalizeProductName
// напрямую, чтобы не создавать циклическую зависимость с gptSlice).
const poolKey = (label: string, dir: "up" | "down") =>
  `${normalizeProductName(label)}::${dir}`;

/**
 * Реконструирует пул источников и сквозные счётчики номеров бейджа из понодовых
 * данных (`data.sourcesUp` / `data.sourcesDown`). Нужен для старых сохранённых
 * графов, в которых нет блока `state.sources`, а также как фолбэк при загрузке.
 *
 * Понодовые источники сохраняются в узлах, но номер бейджа «📖 N» (`seq`) — нет.
 * Восстанавливаем `seq` ПО НАПРАВЛЕНИЯМ: продукты, у которых есть источники в
 * данном направлении, сортируем по `data.sources_meta?.fetchedAt` (фолбэк —
 * порядок узлов) и нумеруем 1..N. Ключ пула — `sourcesPoolKey(label, direction)`,
 * как в живом пуле, поэтому бейдж в `Flow.tsx` подхватит записи без изменений.
 */
export function reconstructSourcesPool(nodes: CustomNode[]): SavedSourcesBlock {
  const pool: Record<string, SourcesPoolEntry> = {};
  const seqCounter = { up: 0, down: 0 };

  type Draft = {
    key: string;
    label: string;
    fetchedAt: string;
    order: number;
    sources: SourcesPoolEntry["sources"];
  };

  const collect = (dir: "up" | "down"): Draft[] => {
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
      drafts.push({
        key,
        label,
        fetchedAt: n.data?.sources_meta?.fetchedAt ?? "",
        order,
        sources,
      });
      pool[key] = {
        sources: [...sources],
        product: label,
        originProduct: label,
        lastFetchedAt: n.data?.sources_meta?.fetchedAt ?? "",
      };
    });
    return drafts;
  };

  (["up", "down"] as const).forEach((dir) => {
    const drafts = collect(dir);
    // Порядок поиска: по времени, затем по порядку узлов (стабильно).
    drafts.sort(
      (a, b) =>
        (a.fetchedAt < b.fetchedAt ? -1 : a.fetchedAt > b.fetchedAt ? 1 : 0) ||
        a.order - b.order,
    );
    drafts.forEach((d) => {
      seqCounter[dir] += 1;
      pool[d.key].seq = seqCounter[dir];
    });
  });

  return { pool, seqCounter };
}
