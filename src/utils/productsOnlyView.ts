// src/utils/productsOnlyView.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { applyHandlesByGeometry } from "./normalize-edges";
import { isRecycleEdge } from "./recycleEdge";

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

  // Входы/выходы каждой скрытой (не-product) ноды. Выход по связи
  // рециклинга (recycleEdge.ts) — отдельно: склеенная через него связь тоже
  // рециклинг, пунктиром, и встречная обычная связь её не отменяет.
  const insByNode = new Map<string, string[]>();
  const outsByNode = new Map<string, string[]>();
  // «узел->продукт» → смысл связи рециклинга: по нему — с какого конца
  // склеенной связи стрелка.
  const recycleOuts = new Map<string, unknown>();
  for (const e of edges) {
    if (!productIds.has(e.source) && productIds.has(e.target)) {
      const arr = outsByNode.get(e.source) ?? [];
      arr.push(e.target);
      outsByNode.set(e.source, arr);
      if (isRecycleEdge(e)) {
        recycleOuts.set(
          `${e.source}->${e.target}`,
          (e.data as { tFlow?: unknown } | undefined)?.tFlow,
        );
      }
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
        if (recycleOuts.has(`${n.id}->${tgt}`)) {
          const recycleKey = `${src}->${tgt}::recycle`;
          if (seenPairs.has(recycleKey)) continue;
          seenPairs.add(recycleKey);
          syntheticEdges.push({
            id: `pv::${src}::${tgt}::recycle`,
            source: src,
            target: tgt,
            type: "straight",
            className: "edge--recycle",
            // Выход — вещество идёт к продукту на конце (src → tgt); вход
            // (шаг «вверх») — от него, к продукту в начале.
            data: {
              recycle: true,
              recycleArrow:
                recycleOuts.get(`${n.id}->${tgt}`) === "in" ? "start" : "end",
            },
          });
          continue;
        }
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
