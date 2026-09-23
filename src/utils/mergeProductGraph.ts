import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { colorForPresentations } from "./presentationColors";
import { createProductIndex } from "./productIdentity";

export interface MergeInput {
  existingNodes: CustomNode[];
  existingEdges: Edge[];
  /** Узлы из вновь распарсенного JSON. Их id должны быть предварительно пронеймспейсены, чтобы не конфликтовать с уже существующими. */
  newNodes: CustomNode[];
  newEdges: Edge[];
  /** Актуальный реестр презентация → цвет, уже расширенный новыми презентациями. */
  registry: Record<string, string>;
}

export interface MergeOutput {
  nodes: CustomNode[];
  edges: Edge[];
  /** Соответствие newId → existingId для узлов, схлопнутых в существующие (используется при ремэппинге рёбер). */
  idRemap: Record<string, string>;
}

export function mergeProductGraph({
  existingNodes,
  existingEdges,
  newNodes,
  newEdges,
  registry,
}: MergeInput): MergeOutput {
  // 1) Указатель по product-узлам текущего графа: собственный идентификатор
  //    продукта, а при его отсутствии — нормализованное название.
  const index = createProductIndex(existingNodes);

  // 2) Глубоко копируем существующие узлы (чтобы не мутировать вход)
  const mutated: CustomNode[] = existingNodes.map((n) => ({
    ...n,
    data: { ...n.data },
  }));

  const idRemap: Record<string, string> = {};
  const appended: CustomNode[] = [];

  for (const incoming of newNodes) {
    const existingId =
      incoming.type === "product" ? index.find(incoming.data) : null;

    if (existingId) {
      // Схлопываем в существующий узел: объединяем презентации, пересчитываем цвет.
      idRemap[incoming.id] = existingId;
      const target = mutated.find((n) => n.id === existingId);
      if (target) {
        const prev = Array.isArray(target.data.presentations)
          ? (target.data.presentations as string[])
          : [];
        const next = Array.isArray(incoming.data.presentations)
          ? (incoming.data.presentations as string[])
          : [];
        const mergedPresentations = Array.from(new Set([...prev, ...next]));
        target.data.presentations = mergedPresentations;
        target.data.presentationColor = colorForPresentations(
          mergedPresentations,
          registry,
        );
        // Слияние оригинальных написаний: за каждой презентацией нового
        // узла закрепляем его собственный label (могут отличаться по
        // регистру/окончанию — «Ацетон» vs «Ацетоны»).
        const prevLabels =
          typeof target.data.labelsByPresentation === "object" &&
          target.data.labelsByPresentation
            ? (target.data.labelsByPresentation as Record<string, string>)
            : {};
        const incomingLabels =
          typeof incoming.data?.labelsByPresentation === "object" &&
          incoming.data.labelsByPresentation
            ? (incoming.data.labelsByPresentation as Record<string, string>)
            : {};
        const incomingLabel =
          typeof incoming.data?.label === "string" ? incoming.data.label : "";
        const merged: Record<string, string> = { ...prevLabels };
        for (const p of next) {
          merged[p] = incomingLabels[p] ?? incomingLabel ?? merged[p] ?? "";
        }
        target.data.labelsByPresentation = merged;
        // Узлы сошлись по названию, а идентификатор был только у пришедшего —
        // забираем его себе. Иначе он терялся бы при каждом объединении, и
        // граф так и не набирал бы ключей, по которым схлопываться дальше.
        if (
          typeof incoming.data?.productId === "string" &&
          incoming.data.productId.trim() &&
          !(
            typeof target.data.productId === "string" &&
            target.data.productId.trim()
          )
        ) {
          target.data.productId = incoming.data.productId;
          target.data.productIdSource = incoming.data.productIdSource;
          // У узла появился идентификатор — указатель должен о нём знать,
          // иначе следующий продукт с тем же кодом, но другим названием,
          // проедет мимо и заведёт себе отдельный узел.
          index.add(existingId, target.data);
        }
      }
      continue;
    }

    // Иначе — добавляем как новый узел.
    const presentations = Array.isArray(incoming.data?.presentations)
      ? (incoming.data.presentations as string[])
      : [];
    const incomingLabel =
      typeof incoming.data?.label === "string" ? incoming.data.label : "";
    const incomingLabels =
      typeof incoming.data?.labelsByPresentation === "object" &&
      incoming.data.labelsByPresentation
        ? (incoming.data.labelsByPresentation as Record<string, string>)
        : null;
    const labelsByPresentation: Record<string, string> = {};
    if (incoming.type === "product") {
      for (const p of presentations) {
        labelsByPresentation[p] = incomingLabels?.[p] ?? incomingLabel;
      }
    }
    appended.push({
      ...incoming,
      data: {
        ...incoming.data,
        presentations,
        presentationColor:
          incoming.type === "product"
            ? colorForPresentations(presentations, registry)
            : undefined,
        ...(incoming.type === "product" &&
        Object.keys(labelsByPresentation).length > 0
          ? { labelsByPresentation }
          : {}),
      },
    });
    if (incoming.type === "product") {
      index.add(incoming.id, incoming.data);
    }
  }

  // 3) Рёбра: применяем idRemap к концам, дропаем self-loops.
  const remappedNewEdges: Edge[] = [];
  for (const e of newEdges) {
    const source = idRemap[e.source] ?? e.source;
    const target = idRemap[e.target] ?? e.target;
    if (source === target) continue;
    remappedNewEdges.push({ ...e, source, target });
  }

  // 4) Защитный dedup по id: если из-за коллизий неймспейсов на вход
  // пришли узлы с одинаковыми id, оставляем первый — React Flow
  // ломается на дублях (узел может «пропадать» при клике). Заодно
  // отфильтровываем рёбра, ссылки которых не разрешаются.
  const seenIds = new Set<string>();
  const dedupedNodes: CustomNode[] = [];
  for (const n of [...mutated, ...appended]) {
    if (seenIds.has(n.id)) continue;
    seenIds.add(n.id);
    dedupedNodes.push(n);
  }
  const validIds = new Set(dedupedNodes.map((n) => n.id));
  const dedupedEdges = [...existingEdges, ...remappedNewEdges].filter(
    (e) => validIds.has(e.source) && validIds.has(e.target),
  );

  return {
    nodes: dedupedNodes,
    edges: dedupedEdges,
    idRemap,
  };
}
