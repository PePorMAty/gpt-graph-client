// src/utils/resolveChainOverlap.ts

import type { CustomNode } from "../types";

const NODE_W = 220;
const NODE_H = 80;
const PAD = 40;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function nodeToRect(pos: { x: number; y: number }): Rect {
  return { x: pos.x, y: pos.y, w: NODE_W, h: NODE_H };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w + PAD <= b.x ||
    b.x + b.w + PAD <= a.x ||
    a.y + a.h + PAD <= b.y ||
    b.y + b.h + PAD <= a.y
  );
}

/**
 * Вычисляет горизонтальный сдвиг для группы новых нод,
 * чтобы они не пересекались с существующими.
 *
 * Пробует: 0, +spacingX, -spacingX, +2·spacingX, -2·spacingX, ...
 */
export function computeShiftX(
  newNodes: CustomNode[],
  existingNodes: CustomNode[],
  spacingX: number = 260,
): number {
  if (!newNodes.length || !existingNodes.length) return 0;

  const existRects = existingNodes.map((n) => nodeToRect(n.position));

  for (let attempt = 0; attempt < 20; attempt++) {
    const sign = attempt === 0 ? 0 : attempt % 2 === 1 ? 1 : -1;
    const mag = Math.ceil(attempt / 2);
    const dx = sign * mag * spacingX;

    const hasCollision = newNodes.some((n) => {
      const r = nodeToRect({ x: n.position.x + dx, y: n.position.y });
      return existRects.some((er) => rectsOverlap(r, er));
    });

    if (!hasCollision) return dx;
  }

  // fallback: сдвигаем далеко вправо
  const maxX = existingNodes.reduce(
    (mx, n) => Math.max(mx, n.position.x),
    -Infinity,
  );
  const minNewX = newNodes.reduce(
    (mn, n) => Math.min(mn, n.position.x),
    Infinity,
  );
  return maxX + NODE_W + PAD * 2 - minNewX;
}

/** Пересекается ли узел в точке pos с каким-нибудь из nodes (с тем же зазором). */
export function overlapsAny(
  pos: { x: number; y: number },
  nodes: CustomNode[],
): boolean {
  const r = nodeToRect(pos);
  return nodes.some((n) => rectsOverlap(r, nodeToRect(n.position)));
}

/**
 * Отодвинуть узел по горизонтали в одну сторону (dir: −1 влево, +1 вправо)
 * до первого свободного места. Нужен, когда сторона важна: альтернатива,
 * стоявшая слева от шага, уходит дальше влево, а не перескакивает через него.
 */
export function pushAsideX(
  pos: { x: number; y: number },
  obstacles: CustomNode[],
  dir: 1 | -1,
  spacingX: number = 260,
): { x: number; y: number } {
  let x = pos.x;
  for (let i = 0; i < 40 && overlapsAny({ x, y: pos.y }, obstacles); i++) {
    x += dir * spacingX;
  }
  return { x, y: pos.y };
}
