// src/utils/prospectiveSources.ts
//
// Разделы справочников (ИТС) о перспективных технологиях — не источник
// (просьба заказчика, 2026-10-05): процесс, который промышленность ещё не
// освоила, не становится ни шагом, ни альтернативой. Сервер такие разделы
// больше не хранит и не отдаёт, а в графах, сохранённых раньше, они ещё лежат —
// с пометкой prospective и с меткой в начале текста. При открытии графа их
// отбрасываем: иначе они остались бы в списках и ушли бы в обобщение и в
// техописание.

import type { CustomNode } from "../types";
import type { SourcesPoolEntry } from "../store/types";

const LEGACY_MARK = "[Перспективная технология";

export function isProspectiveSource(s: unknown): boolean {
  const src = s as { prospective?: unknown; technology_description?: unknown } | null;
  return (
    src?.prospective === true ||
    String(src?.technology_description ?? "").trimStart().startsWith(LEGACY_MARK)
  );
}

const SOURCE_FIELDS = ["sourcesUp", "sourcesDown", "sources"] as const;

/** Узлы без таких источников; узлы без них возвращаются как были. */
export function withoutProspectiveInNodes(nodes: CustomNode[]): CustomNode[] {
  return nodes.map((n) => {
    let data: CustomNode["data"] | null = null;
    for (const field of SOURCE_FIELDS) {
      const list = n.data?.[field];
      if (!Array.isArray(list) || !list.some(isProspectiveSource)) continue;
      data = { ...(data ?? n.data), [field]: list.filter((s) => !isProspectiveSource(s)) };
    }
    return data ? { ...n, data } : n;
  });
}

/** Пул источников без таких источников. */
export function withoutProspectiveInPool(
  pool: Record<string, SourcesPoolEntry>,
): Record<string, SourcesPoolEntry> {
  if (!Object.values(pool).some((e) => e.sources?.some(isProspectiveSource))) {
    return pool;
  }
  return Object.fromEntries(
    Object.entries(pool).map(([key, entry]) => [
      key,
      entry.sources?.some(isProspectiveSource)
        ? { ...entry, sources: entry.sources.filter((s) => !isProspectiveSource(s)) }
        : entry,
    ]),
  );
}
