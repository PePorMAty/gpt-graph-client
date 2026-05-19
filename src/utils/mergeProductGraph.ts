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

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
      }
      continue;
    }

    // Иначе — добавляем как новый узел.
    const presentations = Array.isArray(incoming.data?.presentations)
      ? (incoming.data.presentations as string[])
      : [];
    appended.push({
      ...incoming,
      data: {
        ...incoming.data,
        presentations,
        presentationColor:
          incoming.type === "product"
            ? colorForPresentations(presentations, registry)
            : undefined,
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

  return {
    nodes: [...mutated, ...appended],
    edges: [...existingEdges, ...remappedNewEdges],
    idRemap,
  };
}
