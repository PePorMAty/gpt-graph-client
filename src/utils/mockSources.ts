import type { BuildDirection, SourcesPoolEntry } from "../store/types";

/** Одна строка таблицы источников: продукт + направление построения + сам источник. */
export interface SourceRow {
  id: string;
  /** Метка продукта, которому принадлежат источники. */
  product: string;
  /** Для какого построения (вверх/вниз) найдены источники. */
  direction: BuildDirection;
  title: string;
  url: string;
}

const DIRECTIONS: BuildDirection[] = ["up", "down"];

/**
 * Собрать строки таблицы из реального пула источников (`sourcesPool`).
 * Для каждого продукта × направления берём `entry.sources` и раскладываем по строкам.
 */
export function collectSourceRows(
  productLabels: string[],
  sourcesPool: Record<string, SourcesPoolEntry>,
  poolKey: (label: string, direction: BuildDirection) => string,
): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const label of productLabels) {
    for (const direction of DIRECTIONS) {
      const entry = sourcesPool[poolKey(label, direction)];
      const sources = entry?.sources ?? [];
      sources.forEach((s, i) => {
        rows.push({
          id: `${label}::${direction}::${i}`,
          product: label,
          direction,
          title: s.title,
          url: s.url,
        });
      });
    }
  }
  return rows;
}

/**
 * Мок-источники для наглядности (пока нет данных с бэкенда). Генерируются по
 * меткам продуктов графа, чтобы у каждого продукта — включая текущий — были
 * источники по обоим направлениям.
 */
export function buildMockSourceRows(productLabels: string[]): SourceRow[] {
  const rows: SourceRow[] = [];
  const perDirection: Record<BuildDirection, number> = { up: 2, down: 3 };

  productLabels.forEach((label, pIdx) => {
    for (const direction of DIRECTIONS) {
      const count = perDirection[direction];
      const dirRu = direction === "up" ? "вверх" : "вниз";
      for (let i = 0; i < count; i++) {
        const slug = encodeURIComponent(label.toLowerCase().replace(/\s+/g, "-"));
        rows.push({
          id: `mock::${label}::${direction}::${i}`,
          product: label,
          direction,
          title: `${label}: источник по построению ${dirRu} №${i + 1}`,
          url: `https://example.org/${slug}/${direction}/${pIdx + 1}-${i + 1}`,
        });
      }
    }
  });

  return rows;
}
