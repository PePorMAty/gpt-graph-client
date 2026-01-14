// hooks/useGraphSearch.ts
import { useEffect, useState } from "react";
import type { CustomNode } from "../types";

export function useGraphSearch(
  nodes: CustomNode[],
  query: string,
  delay = 300
) {
  const [debounced, setDebounced] = useState(query);
  const [results, setResults] = useState<CustomNode[]>([]);

  // debounce
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
    }, delay);

    return () => clearTimeout(id);
  }, [query, delay]);

  // search
  useEffect(() => {
    const q = debounced.trim().toLowerCase();

    if (!q) {
      setResults([]);
      return;
    }

    const found = nodes.filter((n) => {
      if (!n.data?.label) return false;
      if (n.type !== "product" && n.type !== "transformation") return false;

      return n.data.label.toLowerCase().includes(q);
    });

    setResults(found);
  }, [debounced, nodes]);

  return results;
}
