import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

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
 * геометрии нод.
 *
 * Сначала определяет преобладающую ось layout по разбросу координат:
 *  - если разброс X заметно больше Y → horizontal (LR/RL), хэндлы left/right;
 *  - иначе → vertical (TB/BT), хэндлы top/bottom (поведение по умолчанию).
 *
 * Затем для каждого ребра по знаку дельты выбирает конкретный хэндл,
 * чтобы линия не «прорезала» сам source-узел.
 */
export function applyHandlesByGeometry(
  nodes: CustomNode[],
  edges: Edge[],
): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  let horizontal = false;
  if (nodes.length > 1) {
    const xs = nodes.map((n) => n.position?.x ?? 0);
    const ys = nodes.map((n) => n.position?.y ?? 0);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    horizontal = xRange > yRange * 1.5;
  }

  return edges.map((e) => {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) return e;

    if (horizontal) {
      const sx = src.position?.x ?? 0;
      const tx = tgt.position?.x ?? 0;
      const isRight = tx >= sx;
      return {
        ...e,
        sourceHandle: isRight ? "right" : "left-source",
        targetHandle: isRight ? "left" : "right-target",
      };
    }

    const sy = src.position?.y ?? 0;
    const ty = tgt.position?.y ?? 0;
    const isDown = ty >= sy;

    return {
      ...e,
      sourceHandle: isDown ? "bottom" : "top-source",
      targetHandle: isDown ? "top" : "bottom-target",
    };
  });
}
