import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { colorForPresentations } from "./presentationColors";

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

// Различные дефисы/тире/минусы и soft hyphen: U+2010, U+2011, U+2012,
// U+2013, U+2014, U+2015, U+2212, U+00AD.
const HYPHENS = /[‐‑‒–—―−­]/g;
// Разные апострофы: U+2019, U+02BC, U+02B9, U+00B4, U+0060.
const APOSTROPHES = /[’ʼʹ´`]/g;
// Zero-width символы: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF.
const ZERO_WIDTH = /[​‌‍﻿]/g;
// Неразрывный пробел U+00A0.
const NBSP = / /g;

function normalizeLabel(s: string): string {
  return s
    .normalize("NFC")
    .replace(HYPHENS, "-")
    .replace(APOSTROPHES, "'")
    .replace(ZERO_WIDTH, "")
    .replace(NBSP, " ")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function mergeProductGraph({
  existingNodes,
  existingEdges,
  newNodes,
  newEdges,
  registry,
}: MergeInput): MergeOutput {
  // 1) Индекс product-узлов из текущего графа по нормализованному label
  const labelToId = new Map<string, string>();
  for (const n of existingNodes) {
    if (n.type !== "product") continue;
    const label = typeof n.data?.label === "string" ? n.data.label : "";
    if (!label) continue;
    labelToId.set(normalizeLabel(label), n.id);
  }

  // 2) Глубоко копируем существующие узлы (чтобы не мутировать вход)
  const mutated: CustomNode[] = existingNodes.map((n) => ({
    ...n,
    data: { ...n.data },
  }));

  const idRemap: Record<string, string> = {};
  const appended: CustomNode[] = [];

  for (const incoming of newNodes) {
    const key = normalizeLabel(
      typeof incoming.data?.label === "string" ? incoming.data.label : "",
    );

    if (incoming.type === "product" && key && labelToId.has(key)) {
      // Схлопываем в существующий узел: объединяем презентации, пересчитываем цвет.
      const existingId = labelToId.get(key)!;
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
    if (incoming.type === "product" && key) {
      labelToId.set(key, incoming.id);
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
