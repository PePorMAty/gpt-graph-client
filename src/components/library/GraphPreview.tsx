import { useMemo } from "react";

import type { CustomNode } from "../../types";
import { minimapNodeColor } from "../../utils/minimapNodeColor";
import styles from "./LibraryScreen.module.css";

interface GraphPreviewProps {
  nodes: CustomNode[];
}

const VIEW_W = 320;
const VIEW_H = 180;
const PADDING = 10;

/**
 * Схематичное превью графа: узлы прямоугольниками в их цветах, вписанные в
 * фиксированный кадр.
 *
 * Настоящий React Flow сюда не ставим — на список из десятков графов это были
 * бы десятки холстов. Здесь нужно лишь «как выглядит граф в общих чертах».
 */
export const GraphPreview = ({ nodes }: GraphPreviewProps) => {
  const shapes = useMemo(() => {
    const placed = nodes.filter((n) => n.position);
    if (!placed.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of placed) {
      const w = n.measured?.width ?? 180;
      const h = n.measured?.height ?? 50;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.min(
      (VIEW_W - PADDING * 2) / width,
      (VIEW_H - PADDING * 2) / height,
    );
    const offsetX = PADDING + (VIEW_W - PADDING * 2 - width * scale) / 2;
    const offsetY = PADDING + (VIEW_H - PADDING * 2 - height * scale) / 2;

    return placed.map((n) => {
      const w = n.measured?.width ?? 180;
      const h = n.measured?.height ?? 50;
      return {
        id: n.id,
        x: offsetX + (n.position.x - minX) * scale,
        y: offsetY + (n.position.y - minY) * scale,
        // Минимальный размер: на больших графах узел иначе схлопывается в точку.
        w: Math.max(3, w * scale),
        h: Math.max(2, h * scale),
        color: minimapNodeColor(n),
      };
    });
  }, [nodes]);

  if (!shapes) {
    return <div className={styles.previewEmpty}>Граф пуст</div>;
  }

  return (
    <svg
      className={styles.preview}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Схема графа"
    >
      {shapes.map((s) => (
        <rect
          key={s.id}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={1.5}
          fill={s.color}
          opacity={0.85}
        />
      ))}
    </svg>
  );
};
