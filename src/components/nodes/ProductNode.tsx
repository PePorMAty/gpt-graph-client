import { Handle, Position } from "@xyflow/react";
import React from "react";
import type { ProductNodeProps } from "../../types";

const DEFAULT_BORDER = "#2196f3";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function mixWithWhite(hex: string, t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#e3f2fd";
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(33, 150, 243, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Бейдж источников по одному направлению: стрелка (↑/↓) + книга + число
 * продуктов-источников. Направление = для какого построения (вверх/вниз) найдены
 * источники; число приходит из data.sourcesBadge (см. Flow.tsx / sourcesBadge.ts).
 */
const SourcesPill: React.FC<{
  direction: "up" | "down";
  count: number;
  color: string;
}> = ({ direction, count, color }) => (
  <div
    title={`Источники для построения ${
      direction === "up" ? "вверх" : "вниз"
    }: ${count} продукт(ов)`}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      padding: "2px 6px",
      borderRadius: 999,
      background: color,
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1,
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    }}
  >
    {/* стрелка направления построения */}
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "up" ? (
        <>
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </>
      ) : (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </>
      )}
    </svg>
    {/* книга */}
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
    {count}
  </div>
);

export const ProductNode: React.FC<ProductNodeProps> = ({ data }) => {
  const color =
    typeof data.presentationColor === "string" && data.presentationColor
      ? data.presentationColor
      : DEFAULT_BORDER;
  const background = mixWithWhite(color, 0.85);
  const shadow = hexToRgba(color, 0.2);

  // Бейджи источников по направлениям (↑/↓ + книга + число) — вычисляются в
  // Flow.tsx и приходят в data.sourcesBadge. Показываем оба, если есть и те и те.
  const badge =
    data.sourcesBadge && typeof data.sourcesBadge === "object"
      ? (data.sourcesBadge as { up?: number; down?: number })
      : null;
  const upCount = typeof badge?.up === "number" ? badge.up : 0;
  const downCount = typeof badge?.down === "number" ? badge.down : 0;

  // Фокус-режим: число связей узла, обрезанных границей видимой окрестности
  // (см. buildFocusSubgraph). «+N» подсказывает, что за узлом есть
  // продолжение — клик сделает его новым центром и покажет скрытое.
  const focusMore =
    typeof data.focusMoreCount === "number" ? data.focusMoreCount : 0;

  return (
    <div
      style={{
        background,
        padding: "15px",
        borderRadius: "8px",
        border: `2px solid ${color}`,
        minWidth: "180px",
        maxWidth: "250px",
        textAlign: "center",
        boxShadow: `0 2px 8px ${shadow}`,
        position: "relative", // Важно для правильного позиционирования
        zIndex: 10,
      }}
    >
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        style={{ background: color, width: 8, height: 8 }}
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        style={{ opacity: 0, width: 8, height: 8, pointerEvents: "none" }}
      />

      {(upCount > 0 || downCount > 0) && (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            display: "flex",
            alignItems: "center",
            gap: 4,
            zIndex: 11,
          }}
        >
          {upCount > 0 && (
            <SourcesPill direction="up" count={upCount} color={color} />
          )}
          {downCount > 0 && (
            <SourcesPill direction="down" count={downCount} color={color} />
          )}
        </div>
      )}

      <div style={{ fontSize: "12px", lineHeight: "1.3" }}>{data.label}</div>

      {focusMore > 0 && (
        <div
          title={`Скрытых связей за границей видимости: ${focusMore}. Кликните по узлу, чтобы перейти к ним.`}
          style={{
            position: "absolute",
            bottom: -10,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "2px 8px",
            borderRadius: 999,
            background: "#64748b",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.2,
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 11,
          }}
        >
          ещё {focusMore}
        </div>
      )}

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{ background: color, width: 8, height: 8 }}
      />
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        style={{ opacity: 0, width: 8, height: 8, pointerEvents: "none" }}
      />
    </div>
  );
};
