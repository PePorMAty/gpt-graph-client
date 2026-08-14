// src/utils/enrichSourcesFromNodes.ts
import type { CustomNode } from "../types";
import type { TechnologySource } from "../store/types";

/**
 * Восстанавливает содержимое источников (technology_description и остальные
 * «тяжёлые» поля) по понодовым данным графа.
 *
 * Зачем: в файл графа и автосейв пул источников кладётся ОБЛЕГЧЁННЫМ — только
 * title/url, а technology_description обнуляется, чтобы не раздувать сейв
 * (см. buildSaveGraphPayload). Полные тексты остаются в узлах
 * (data.sourcesUp / data.sourcesDown). После перезагрузки или открытия
 * сохранённого графа в пуле лежат пустышки, и обобщение, которое шлёт на
 * сервер именно пул, падало с «Need at least 1 technology_description block
 * to aggregate».
 *
 * Индекс строим по ВСЕМ узлам, а не только по текущему: унаследованный пул
 * ссылается на источники предка, и полный текст лежит у того продукта, для
 * которого поиск реально выполнялся.
 */
export function enrichSourcesFromNodes(
  sources: TechnologySource[],
  nodes: CustomNode[],
): TechnologySource[] {
  if (!sources.length) return sources;

  // Обогащать нечего, если содержимое и так на месте.
  const needsFix = sources.some(
    (s) => !String(s?.technology_description ?? "").trim(),
  );
  if (!needsFix) return sources;

  const urlKey = (u: unknown) => String(u ?? "").trim().toLowerCase();

  const byUrl = new Map<string, TechnologySource>();
  for (const node of nodes) {
    if (node.type !== "product") continue;
    for (const field of ["sourcesUp", "sourcesDown"] as const) {
      const list = node.data?.[field];
      if (!Array.isArray(list)) continue;
      for (const s of list as TechnologySource[]) {
        const key = urlKey(s?.url);
        if (!key || byUrl.has(key)) continue;
        if (!String(s?.technology_description ?? "").trim()) continue;
        byUrl.set(key, s);
      }
    }
  }
  if (byUrl.size === 0) return sources;

  return sources.map((s) => {
    if (String(s?.technology_description ?? "").trim()) return s;
    const full = byUrl.get(urlKey(s?.url));
    if (!full) return s;
    // Заголовок оставляем от исходной записи (мог быть отредактирован),
    // содержимое подтягиваем из узла.
    return {
      ...s,
      access_hint: s.access_hint || full.access_hint,
      technology_description: full.technology_description,
      inputs_outputs_hint: s.inputs_outputs_hint?.length
        ? s.inputs_outputs_hint
        : full.inputs_outputs_hint,
      evidence_snippets: s.evidence_snippets?.length
        ? s.evidence_snippets
        : full.evidence_snippets,
    };
  });
}
