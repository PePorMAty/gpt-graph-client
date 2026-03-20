import type { Edge } from "@xyflow/react";

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
    const key = `${e.source}->${e.target}`;
    const reverseKey = `${e.target}->${e.source}`;

    // если обратная связь уже есть → не создаём цикл
    if (seenPairs.has(reverseKey)) {
      // просто игнорируем это ребро, цикл убираем
      continue;
    }

    // иначе добавляем
    result.push(e);
    seenPairs.add(key);
  }

  return result;
}
