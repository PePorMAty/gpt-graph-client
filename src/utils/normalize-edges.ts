import type { Edge } from "@xyflow/react";

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
