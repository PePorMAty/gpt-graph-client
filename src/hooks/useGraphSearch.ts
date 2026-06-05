// hooks/useGraphSearch.ts
import { useEffect, useMemo, useState } from "react";
import type { CustomNode } from "../types";
import { normalizeProductName } from "../utils/normalizeProductName";

// Чем выше score, тем выше узел в результатах.
function scoreLabel(normalizedLabel: string, normalizedQuery: string): number {
  if (normalizedLabel === normalizedQuery) return 1000;
  const tokens = normalizedLabel.split(" ");
  if (tokens.includes(normalizedQuery)) return 100;
  if (tokens.some((t) => t.startsWith(normalizedQuery))) return 50;
  if (tokens.some((t) => t.includes(normalizedQuery))) return 25;
  if (normalizedLabel.includes(normalizedQuery)) return 10;
  return 0;
}

export function useGraphSearch(
  nodes: CustomNode[],
  query: string,
  delay = 300,
) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
    }, delay);
    return () => clearTimeout(id);
  }, [query, delay]);

  return useMemo(() => {
    const q = normalizeProductName(debounced);
    if (!q) return [];

    const scored: Array<{ node: CustomNode; score: number; len: number }> = [];
    for (const n of nodes) {
      if (!n.data?.label) continue;
      if (n.type !== "product" && n.type !== "transformation") continue;
      const normalized = normalizeProductName(n.data.label);
      const score = scoreLabel(normalized, q);
      if (score === 0) continue;
      scored.push({ node: n, score, len: normalized.length });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // При равном весе — короче лейбл выше (совпадение «плотнее»).
      if (a.len !== b.len) return a.len - b.len;
      // Стабильная сортировка по label, чтобы порядок не плавал.
      return (a.node.data.label ?? "").localeCompare(b.node.data.label ?? "");
    });

    return scored.map((s) => s.node);
  }, [debounced, nodes]);
}
