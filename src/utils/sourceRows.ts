import type { BuildDirection, SourcesPoolEntry } from "../store/types";
import { normalizeProductName } from "./normalizeProductName";

export interface SourceItem {
  title: string;
  url: string;
  /** Раздел документа из базы сервера или веб (см. TechnologySource). */
  origin?: "local" | "web";
  page?: number;
  docTitle?: string;
  pages?: string;
  /** Найден моделью раньше и взят из базы сервера. */
  savedAt?: string;
}

/** Группа источников одного продукта по одному направлению построения. */
export interface SourceGroup {
  id: string;
  product: string;
  direction: BuildDirection;
  /** Если источники унаследованы — метка продукта-источника (иначе null). */
  inheritedFrom: string | null;
  /** Источники (дедуп по url). Для унаследованных групп — копия набора предка. */
  sources: SourceItem[];
}

const DIRECTIONS: BuildDirection[] = ["up", "down"];

/**
 * Собрать группы источников из реального пула по всем продуктам графа.
 * Наследование определяется по `originProduct` (≠ продукту ⇒ унаследовано).
 * Источники внутри группы дедупятся по url (фолбэк — title).
 */
export function collectSourceGroups(
  productLabels: string[],
  sourcesPool: Record<string, SourcesPoolEntry>,
  poolKey: (label: string, direction: BuildDirection) => string,
): SourceGroup[] {
  const groups: SourceGroup[] = [];

  for (const label of productLabels) {
    for (const direction of DIRECTIONS) {
      const entry = sourcesPool[poolKey(label, direction)];
      if (!entry || !entry.sources || entry.sources.length === 0) continue;

      const inherited =
        !!entry.originProduct &&
        normalizeProductName(entry.originProduct) !==
          normalizeProductName(label);

      // Дедуп по url (фолбэк title).
      const seen = new Set<string>();
      const sources: SourceItem[] = [];
      for (const s of entry.sources) {
        const key = (s.url || s.title || "").trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        sources.push({
          title: s.title,
          url: s.url,
          ...(s.origin ? { origin: s.origin } : {}),
          ...(s.page != null ? { page: s.page } : {}),
          ...(s.docTitle ? { docTitle: s.docTitle } : {}),
          ...(s.pages ? { pages: s.pages } : {}),
          ...(s.savedAt ? { savedAt: s.savedAt } : {}),
        });
      }

      groups.push({
        id: `${label}::${direction}`,
        product: label,
        direction,
        inheritedFrom: inherited ? (entry.originProduct as string) : null,
        sources,
      });
    }
  }

  return groups;
}
