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
    if (e.source === e.target) continue;

    const key = `${e.source}->${e.target}`;
    const reverseKey = `${e.target}->${e.source}`;

    if (seenPairs.has(key)) continue;
    if (seenPairs.has(reverseKey)) continue;

    result.push(e);
    seenPairs.add(key);
  }

  return result;
}
