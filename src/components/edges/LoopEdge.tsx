import { memo } from "react";
import {
  BaseEdge,
  Position,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";

/** Насколько связь отходит от хэндла, прежде чем повернуть. */
const OFFSET = 22;
/** Зазор между обходной линией и краем узла. */
const MARGIN = 34;
/** Радиус скругления углов. */
const RADIUS = 10;

type Pt = { x: number; y: number };

/** Ломаная со скруглёнными углами — SVG-путь. */
function roundedPath(points: Pt[]): string {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(RADIUS, inLen / 2, outLen / 2);
    if (r <= 0) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const before = {
      x: cur.x - ((cur.x - prev.x) / inLen) * r,
      y: cur.y - ((cur.y - prev.y) / inLen) * r,
    };
    const after = {
      x: cur.x + ((next.x - cur.x) / outLen) * r,
      y: cur.y + ((next.y - cur.y) / outLen) * r,
    };
    d += ` L ${before.x} ${before.y} Q ${cur.x} ${cur.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Связь в обход узлов — для продукта, стоящего не на своей стороне
 * преобразования (см. edgeFlow.ts): выход шага «вниз», уже стоящий на полотне
 * выше преобразования, выходит из его низа, сырьё ниже него — входит в верх.
 * Прямая между такими хэндлами прошла бы сквозь сам узел, поэтому линия
 * отходит от хэндла, огибает оба узла сбоку — с той стороны, где обход
 * короче, — и подходит к продукту с его ближней стороны.
 */
function LoopEdgeImpl({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  interactionWidth,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const box = (node: typeof sourceNode, x: number) => {
    const left = node?.internals.positionAbsolute.x ?? x;
    const width = node?.measured?.width ?? 0;
    return { left, right: left + width };
  };
  const s = box(sourceNode, sourceX);
  const t = box(targetNode, targetX);

  // Хэндл снизу — отходим вниз, сверху — вверх; к цели подходим так же.
  const y1 = sourceY + (sourcePosition === Position.Bottom ? OFFSET : -OFFSET);
  const y2 = targetY + (targetPosition === Position.Bottom ? OFFSET : -OFFSET);

  // Сторона обхода — где путь короче.
  const rightLane = Math.max(s.right, t.right) + MARGIN;
  const leftLane = Math.min(s.left, t.left) - MARGIN;
  const viaRight =
    Math.abs(rightLane - sourceX) + Math.abs(rightLane - targetX) <=
    Math.abs(sourceX - leftLane) + Math.abs(targetX - leftLane);
  const lane = viaRight ? rightLane : leftLane;

  const path = roundedPath([
    { x: sourceX, y: sourceY },
    { x: sourceX, y: y1 },
    { x: lane, y: y1 },
    { x: lane, y: y2 },
    { x: targetX, y: y2 },
    { x: targetX, y: targetY },
  ]);

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
    />
  );
}

export const LoopEdge = memo(LoopEdgeImpl);
