// src/utils/focusTransition.ts
//
// Плавный переход между окрестностями фокус-режима («как в TheBrain»):
//  • остающиеся узлы (включая сам новый центр) плавно переезжают со старых
//    позиций на новые;
//  • уходящие узлы и их рёбра растворяются на старых местах;
//  • появляющиеся узлы «расцветают» из точки, где был кликнутый продукт в
//    старой раскладке, и разъезжаются на свои места, проявляясь по пути.
//
// Анимация ведётся интерполяцией позиций по requestAnimationFrame, а не
// CSS-transition: рёбра React Flow — это SVG-пути, пересчитываемые от позиций
// узлов, за CSS-трансформами узлов они не следуют. Каждый кадр наружу отдаётся
// готовая проекция (onFrame), финальный кадр — точная целевая (onDone).

import type { Edge, Rect } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { FocusSubgraphResult } from "./focusSubgraph";

export const FOCUS_TRANSITION_MS = 550;

// Габариты по умолчанию, если узел ещё не измерен React Flow —
// совпадают с константами раскладки layoutTree.
const FALLBACK_NODE_WIDTH = 220;
const FALLBACK_NODE_HEIGHT = 80;

type XY = { x: number; y: number };

const lerp = (a: XY, b: XY, t: number): XY => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Габаритный прямоугольник раскладки — цель для fitBounds (камера едет
 *  одновременно с движением узлов). */
export function nodesBounds(nodes: CustomNode[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const w = n.measured?.width ?? FALLBACK_NODE_WIDTH;
    const h = n.measured?.height ?? FALLBACK_NODE_HEIGHT;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type FocusTransitionHandle = { cancel: () => void };

export function animateFocusTransition(
  from: FocusSubgraphResult,
  to: FocusSubgraphResult,
  opts: {
    /** Новый центр — точка «расцветания» появляющихся узлов. */
    focusId: string;
    duration?: number;
    onFrame: (view: FocusSubgraphResult) => void;
    onDone: () => void;
  },
): FocusTransitionHandle {
  const duration = opts.duration ?? FOCUS_TRANSITION_MS;

  const fromPos = new Map(from.nodes.map((n) => [n.id, n.position]));
  const toIds = new Set(to.nodes.map((n) => n.id));
  const leavingNodes = from.nodes.filter((n) => !toIds.has(n.id));
  const leavingIds = new Set(leavingNodes.map((n) => n.id));
  // Рёбра, касающиеся уходящих узлов, растворяются вместе с ними. Целевые
  // рёбра с ними не пересекаются (в to уходящих узлов нет) — дублей ключей
  // при объединении списков не возникает.
  const leavingEdges = from.edges.filter(
    (e) => leavingIds.has(e.source) || leavingIds.has(e.target),
  );
  const fromEdgeIds = new Set(from.edges.map((e) => e.id));
  // Откуда расцветают новые узлы: позиция кликнутого продукта в старой
  // раскладке. Если центра там не было (переход из поиска) — узлы просто
  // проявляются на своих местах.
  const enterOrigin = fromPos.get(opts.focusId) ?? null;

  let raf = 0;
  const start = performance.now();

  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    if (t >= 1) {
      opts.onDone();
      return;
    }
    const e = easeInOutCubic(t);
    // Уходящее гаснет в первые 40% пути, новое проявляется с 15% по 65%.
    const fadeOut = 1 - clamp01(t / 0.4);
    const fadeIn = clamp01((t - 0.15) / 0.5);

    const nodes: CustomNode[] = [
      ...to.nodes.map((n) => {
        const prev = fromPos.get(n.id);
        if (prev) {
          // Остающийся узел (включая сам центр) — переезжает.
          return { ...n, position: lerp(prev, n.position, e) };
        }
        // Появляющийся — расцветает из точки клика.
        return {
          ...n,
          position: lerp(enterOrigin ?? n.position, n.position, e),
          style: { ...n.style, opacity: fadeIn },
        };
      }),
      ...leavingNodes.map((n) => ({
        ...n,
        style: { ...n.style, opacity: fadeOut },
      })),
    ];

    const edges: Edge[] = [
      ...to.edges.map((ed) =>
        fromEdgeIds.has(ed.id)
          ? ed
          : { ...ed, style: { ...ed.style, opacity: fadeIn } },
      ),
      ...leavingEdges.map((ed) => ({
        ...ed,
        style: { ...ed.style, opacity: fadeOut },
      })),
    ];

    opts.onFrame({ nodes, edges });
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return { cancel: () => cancelAnimationFrame(raf) };
}
