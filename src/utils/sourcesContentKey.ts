// src/utils/sourcesContentKey.ts
import type { TechnologySource } from "../store/types";

/**
 * Стабильный ключ НАБОРА источников. Продукты, у которых источники совпадают
 * (например, потомок взял источники «взаймы» у предка — это копия того же
 * массива), должны делить ОДИН номер бейджа «📖 N». Ключ не зависит от порядка
 * элементов: сортируем по url (фолбэк — title) и склеиваем.
 *
 * Используется при объединении графов и при реконструкции пула, чтобы номер
 * отражал набор источников, а не каждый продукт по отдельности.
 */
export function sourcesContentKey(sources: TechnologySource[]): string {
  return sources
    .map((s) => (s.url || s.title || "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}
