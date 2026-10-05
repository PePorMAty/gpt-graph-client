import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { productTransformationEnds, semanticHandles, tFlowOf } from "./edgeFlow";

/**
 * Отфильтровывает из newEdges те, для которых обратное ребро
 * уже есть в existingEdges (A→B убирается, если B→A уже существует).
 */
export function filterConflictingEdges(
  newEdges: Edge[],
  existingEdges: Edge[],
): Edge[] {
  const existingPairs = new Set<string>(
    existingEdges.map((e) => `${e.source}->${e.target}`),
  );

  return newEdges.filter((e) => {
    const reverseKey = `${e.target}->${e.source}`;
    return !existingPairs.has(reverseKey);
  });
}

export function normalizeEdges(edges: Edge[]): Edge[] {
  const result: Edge[] = [];
  const seenPairs = new Set<string>();

  for (const e of edges) {
    if (e.source === e.target) continue;

    const key = `${e.source}->${e.target}`;
    const reverseKey = `${e.target}->${e.source}`;

    if (seenPairs.has(key)) continue;
    if (seenPairs.has(reverseKey)) continue;

    // дефолтные handles для edges, пришедших без них (от сервера / из файла):
    // top-down layout → source.bottom → target.top. Если handles уже выставлены
    // (например, top-source/bottom-target для направления "up") — сохраняем их.
    result.push({
      ...e,
      sourceHandle: e.sourceHandle ?? "bottom",
      targetHandle: e.targetHandle ?? "top",
    });
    seenPairs.add(key);
  }

  return result;
}

/**
 * Перевыставляет sourceHandle/targetHandle у edges, исходя из реальной
 * y-геометрии нод. Если source.y < target.y — поток идёт вниз
 * (bottom → top); если source.y > target.y — вверх (top-source →
 * bottom-target). Это нужно когда layout/server раскладывает граф
 * "снизу вверх" (root внизу), и захардкоженный bottom→top рисует линии
 * сквозь сам source-узел.
 *
 * Связь «продукт ↔ преобразование» с пометкой смысла (edge.data.tFlow, см.
 * edgeFlow.ts) получает хэндлы по смыслу: сырьё — в верх преобразования,
 * продукт — из низа, а продукт не на своей стороне рисуется в обход. Иначе
 * выход шага «вниз», стоящий выше преобразования, цеплялся к его верху — как
 * сырьё. semantic: false — по одной геометрии: фокус-режим раскладывает
 * окрестность по-своему.
 */
export function applyHandlesByGeometry(
  nodes: CustomNode[],
  edges: Edge[],
  opts: { semantic?: boolean } = {},
): Edge[] {
  const semantic = opts.semantic ?? true;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const typeOf = (id: string) => nodeMap.get(id)?.type;

  return edges.map((e) => {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) return e;

    const flow = semantic ? tFlowOf(e) : undefined;
    if (flow && productTransformationEnds(e, typeOf)) {
      return semanticHandles(e, flow, src, tgt);
    }

    const sy = src.position?.y ?? 0;
    const ty = tgt.position?.y ?? 0;
    const isDown = ty >= sy;

    return {
      ...e,
      sourceHandle: isDown ? "bottom" : "top-source",
      targetHandle: isDown ? "top" : "bottom-target",
      // Обход нужен только связи со смыслом; по геометрии — прямая.
      ...(e.type === "loop" ? { type: "straight" } : {}),
    };
  });
}
