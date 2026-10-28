// hooks/useGraphSearch.ts
import { useEffect, useState } from "react";
import type { CustomNode } from "../types";
import { matchCode, parseCodeQuery, type NodeCode } from "../utils/nodeCodes";

/** Найденный узел; code — код, по которому нашёлся (по названию — null). */
export interface GraphSearchHit {
  node: CustomNode;
  code: NodeCode | null;
}

/**
 * Поиск узлов графа: по названию и по коду продукта — CAS, ОКПД2, ТН ВЭД
 * (codesOf, см. utils/nodeCodes.ts). Набран код — сперва узлы с этим кодом,
 * потом совпавшие по названию; иначе — только по названию.
 */
export function useGraphSearch(
  nodes: CustomNode[],
  query: string,
  delay = 300,
  codesOf?: (node: CustomNode) => NodeCode[],
) {
  const [debounced, setDebounced] = useState(query);
  const [results, setResults] = useState<GraphSearchHit[]>([]);

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

    const searchable = nodes.filter(
      (n) => n.data?.label && (n.type === "product" || n.type === "transformation"),
    );
    const codeQuery = codesOf ? parseCodeQuery(q) : null;
    const byCode: GraphSearchHit[] = [];
    if (codeQuery) {
      for (const node of searchable) {
        const code = matchCode(codesOf!(node), codeQuery);
        if (code) byCode.push({ node, code });
      }
    }
    const seen = new Set(byCode.map((h) => h.node.id));
    const byLabel = searchable
      .filter((n) => !seen.has(n.id) && n.data.label.toLowerCase().includes(q))
      .map((node) => ({ node, code: null }));

    setResults([...byCode, ...byLabel]);
  }, [debounced, nodes, codesOf]);

  return results;
}
