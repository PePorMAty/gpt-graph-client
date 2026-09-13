import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { estimateNodeSize } from "../components/nodes/nodeBox";

export interface ViewportStats {
  /** Узлы, попавшие в видимую область (продукты и преобразования). */
  nodes: number;
  /** Связи, у которых оба конца видимы. */
  edges: number;
  /** Длина самой длинной цепочки в видимой области, в шагах-продуктах. */
  chainLength: number;
  /** Продукты, подтверждённые в ГИСП. Пока данных нет — всегда 0. */
  confirmed: number;
}

export interface ViewportRect {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/** Габарит узла: измеренный React Flow, иначе оценка по подписи. */
function nodeSize(node: CustomNode): { width: number; height: number } {
  const measured = node.measured;
  if (measured?.width && measured?.height) {
    return { width: measured.width, height: measured.height };
  }
  return estimateNodeSize(
    String(node.data?.label ?? ""),
    node.data?.focusCompact === true,
  );
}

/**
 * Пересекается ли узел с видимой областью.
 *
 * Камера задана трансформацией `translate(x, y) scale(zoom)`, поэтому
 * видимая область в координатах графа — это прямоугольник
 * `[-x/zoom, -y/zoom]` размером `width/zoom × height/zoom`.
 */
function isVisible(node: CustomNode, view: ViewportRect): boolean {
  const { width, height } = nodeSize(node);
  const left = -view.x / view.zoom;
  const top = -view.y / view.zoom;
  const right = left + view.width / view.zoom;
  const bottom = top + view.height / view.zoom;

  return (
    node.position.x + width >= left &&
    node.position.x <= right &&
    node.position.y + height >= top &&
    node.position.y <= bottom
  );
}

/**
 * Длина самой длинной цепочки продуктов внутри набора узлов.
 *
 * Считается по продуктам: преобразования — это переходы, а не шаги, поэтому
 * продукт→преобразование→продукт даёт длину 2, а не 3. За пределы набора
 * `visibleIds` поиск не уходит: для строки состояния это видимая область, для
 * сводки о графе — все его узлы.
 */
export function longestProductChain(
  visibleIds: Set<string>,
  nodes: CustomNode[],
  edges: Edge[],
): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isProduct = (id: string) => byId.get(id)?.type === "product";

  // Смежность продукт → продукт: напрямую или через одно преобразование.
  const next = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    if (from === to) return;
    const set = next.get(from) ?? new Set<string>();
    set.add(to);
    next.set(from, set);
  };

  const outsOfTransform = new Map<string, string[]>();
  for (const e of edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    if (!isProduct(e.source) && isProduct(e.target)) {
      const arr = outsOfTransform.get(e.source) ?? [];
      arr.push(e.target);
      outsOfTransform.set(e.source, arr);
    }
  }

  for (const e of edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    if (isProduct(e.source) && isProduct(e.target)) {
      link(e.source, e.target);
    } else if (isProduct(e.source) && !isProduct(e.target)) {
      for (const out of outsOfTransform.get(e.target) ?? []) link(e.source, out);
    }
  }

  const products = [...visibleIds].filter(isProduct);
  if (!products.length) return 0;

  // Длиннейший путь с мемоизацией. `onPath` страхует от зацикливания:
  // граф в общем случае не гарантированно ациклический.
  const memo = new Map<string, number>();
  const onPath = new Set<string>();

  const walk = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (onPath.has(id)) return 0;

    onPath.add(id);
    let best = 0;
    for (const to of next.get(id) ?? []) best = Math.max(best, walk(to));
    onPath.delete(id);

    const result = best + 1;
    memo.set(id, result);
    return result;
  };

  return products.reduce((max, id) => Math.max(max, walk(id)), 0);
}

/** Счётчики нижней строки состояния по текущей видимой области. */
export function computeViewportStats(
  nodes: CustomNode[],
  edges: Edge[],
  view: ViewportRect,
): ViewportStats {
  if (!nodes.length || !view.width || !view.height) {
    return { nodes: 0, edges: 0, chainLength: 0, confirmed: 0 };
  }

  const visible = nodes.filter((n) => isVisible(n, view));
  const visibleIds = new Set(visible.map((n) => n.id));

  const visibleEdges = edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  ).length;

  // Подключения к базе ГИСП пока нет: узлы не несут признака подтверждения,
  // поэтому счётчик честно показывает 0, а не выдуманное число.
  const confirmed = visible.filter(
    (n) => n.type === "product" && n.data?.gispConfirmed === true,
  ).length;

  return {
    nodes: visible.length,
    edges: visibleEdges,
    chainLength: longestProductChain(visibleIds, nodes, edges),
    confirmed,
  };
}

/** Длина самой длинной цепочки по всему графу — для сводки в библиотеке. */
export function graphChainLength(nodes: CustomNode[], edges: Edge[]): number {
  return longestProductChain(new Set(nodes.map((n) => n.id)), nodes, edges);
}
