import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { SaveGraphPayload, SourcesPoolEntry } from "../store/types";

export interface BuildSaveGraphPayloadArgs {
  name?: string;
  originalPrompt: string | null;
  nodes: CustomNode[];
  edges: Edge[];
  leafNodes: string[];
  hasMore: boolean;
  sourcesPool: Record<string, SourcesPoolEntry>;
  sourcesSeqCounter: { up: number; down: number };
}

const urlKey = (u: unknown) => String(u ?? "").trim().toLowerCase();

/** Ссылки источников, чей полный текст лежит в данных узлов (sourcesUp/Down). */
function urlsWithTextInNodes(nodes: CustomNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    for (const field of ["sourcesUp", "sourcesDown"] as const) {
      const list = n.data?.[field];
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        if (String(s?.technology_description ?? "").trim()) out.add(urlKey(s?.url));
      }
    }
  }
  return out;
}

// Собрать payload текущего состояния полотна (общий для save и update).
// Тяжёлые поля источника (текст технологии и остальное) в пуле не дублируем,
// если они уже лежат в node.data (sourcesUp/Down): по пути восстановления
// (enrichSourcesFromNodes) они вернутся оттуда. Но пошаговый поиск кладёт
// найденное ТОЛЬКО в пул — в узлах его нет. Облегчённый пул терял такой текст
// насовсем: после открытия сохранённого графа обобщать было нечего, и сервер
// отвечал «Need at least 1 technology_description block to aggregate».
// Поэтому текст, которого нет в узлах, остаётся в пуле как есть.
export function buildSaveGraphPayload({
  name,
  originalPrompt,
  nodes,
  edges,
  leafNodes,
  hasMore,
  sourcesPool,
  sourcesSeqCounter,
}: BuildSaveGraphPayloadArgs): SaveGraphPayload {
  const prompt = originalPrompt ?? name ?? "graph";
  const inNodes = urlsWithTextInNodes(nodes);
  const lightPool = Object.fromEntries(
    Object.entries(sourcesPool).map(([k, e]) => [
      k,
      {
        ...e,
        sources: e.sources.map((s) =>
          inNodes.has(urlKey(s.url))
            ? {
                title: s.title,
                url: s.url,
                access_hint: "",
                technology_description: "",
                inputs_outputs_hint: [],
                evidence_snippets: [],
                // Лёгкие пометки остаются: откуда источник (PDF, из базы) и
                // что добавлен вручную — без них после открытия графа пропали
                // бы значки, а ручной источник стёр бы следующий поиск.
                ...(s.origin ? { origin: s.origin } : {}),
                ...(s.docId != null ? { docId: s.docId } : {}),
                ...(s.sectionId != null ? { sectionId: s.sectionId } : {}),
                ...(s.page != null ? { page: s.page } : {}),
                ...(s.docTitle ? { docTitle: s.docTitle } : {}),
                ...(s.pages ? { pages: s.pages } : {}),
                ...(s.role ? { role: s.role } : {}),
                ...(s.prospective ? { prospective: true } : {}),
                ...(s.savedAt ? { savedAt: s.savedAt } : {}),
                ...(s.baseFor ? { baseFor: s.baseFor } : {}),
                ...(s.isManual ? { isManual: true } : {}),
              }
            : s,
        ),
      },
    ]),
  );
  return {
    name,
    prompt,
    // не сохраняем флаг выделения, чтобы граф не открывался «предвыделенным»
    nodes: nodes.map((n) => {
      const copy = { ...n };
      delete copy.selected;
      // Статус запроса технологического описания — состояние текущего сеанса.
      // Сохранённый на лету «loading» после перезагрузки оставил бы вкладку
      // в вечном ожидании; само описание (techDescription) сохраняем.
      if (
        copy.data?.techDescriptionStatus !== undefined ||
        copy.data?.techDescriptionError !== undefined
      ) {
        const {
          techDescriptionStatus: _status,
          techDescriptionError: _error,
          ...data
        } = copy.data;
        copy.data = data;
      }
      return copy;
    }),
    edges,
    leaf_nodes: leafNodes,
    has_more: hasMore,
    sources: { pool: lightPool, seqCounter: sourcesSeqCounter },
  };
}
