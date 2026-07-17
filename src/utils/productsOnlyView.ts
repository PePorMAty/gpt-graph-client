// src/utils/productsOnlyView.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { applyHandlesByGeometry } from "./normalize-edges";

/**
 * Проекция «только продукты» (режим-тумблер на панели управления): скрывает
 * преобразования и alt-ноды, склеивая продукты напрямую рёбрами через каждое
 * скрытое преобразование (вход×выход). Чистая производная от текущего графа —
 * store не мутируется, поэтому выключение режима гарантированно возвращает
 * полный граф. Alt-ноды отпадают сами: их target скрыт, синтетика для них не
 * строится (у alt нет исходящих product-рёбер).
 */
export function collapseToProductsView(
  nodes: CustomNode[],
  edges: Edge[],
): { nodes: CustomNode[]; edges: Edge[] } {
  const products = nodes.filter((n) => n.type === "product");
  const productIds = new Set(products.map((n) => n.id));

  // Прямые рёбра продукт→продукт сохраняем как есть.
  const directEdges = edges.filter(
    (e) => productIds.has(e.source) && productIds.has(e.target),
  );
  const seenPairs = new Set(directEdges.map((e) => `${e.source}->${e.target}`));

  // Входы/выходы каждой скрытой (не-product) ноды.
  const insByNode = new Map<string, string[]>();
  const outsByNode = new Map<string, string[]>();
  for (const e of edges) {
    if (!productIds.has(e.source) && productIds.has(e.target)) {
      const arr = outsByNode.get(e.source) ?? [];
      arr.push(e.target);
      outsByNode.set(e.source, arr);
    }
    if (productIds.has(e.source) && !productIds.has(e.target)) {
      const arr = insByNode.get(e.target) ?? [];
      arr.push(e.source);
      insByNode.set(e.target, arr);
    }
  }

  // Синтетические рёбра: вход×выход через каждое скрытое преобразование.
  // Цепочек преобразование→преобразование в графе нет (рёбра всегда
  // продукт→tr / tr→продукт / продукт→alt), поэтому одного hop'а достаточно.
  const syntheticEdges: Edge[] = [];
  for (const n of nodes) {
    if (n.type === "product") continue;
    const ins = insByNode.get(n.id) ?? [];
    const outs = outsByNode.get(n.id) ?? [];
    for (const src of ins) {
      for (const tgt of outs) {
        if (src === tgt) continue;
        const pairKey = `${src}->${tgt}`;
        if (seenPairs.has(pairKey) || seenPairs.has(`${tgt}->${src}`)) continue;
        seenPairs.add(pairKey);
        syntheticEdges.push({
          id: `pv::${src}::${tgt}`,
          source: src,
          target: tgt,
          type: "straight",
        });
      }
    }
  }

  return {
    nodes: products,
    edges: [...directEdges, ...applyHandlesByGeometry(products, syntheticEdges)],
  };
}
