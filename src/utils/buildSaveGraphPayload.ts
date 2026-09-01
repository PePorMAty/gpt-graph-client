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

// Собрать payload текущего состояния полотна (общий для save и update).
// Полные источники уже лежат в node.data (sourcesUp/Down). В пуле для сейва
// оставляем только лёгкие url/title (по ним считается номер набора) + номер;
// тяжёлые поля не дублируем, чтобы не раздувать тело запроса.
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
  const lightPool = Object.fromEntries(
    Object.entries(sourcesPool).map(([k, e]) => [
      k,
      {
        ...e,
        sources: e.sources.map((s) => ({
          title: s.title,
          url: s.url,
          access_hint: "",
          technology_description: "",
          inputs_outputs_hint: [],
          evidence_snippets: [],
        })),
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
