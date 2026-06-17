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

export const ProductNode: React.FC<ProductNodeProps> = ({ data }) => {
  const color =
    typeof data.presentationColor === "string" && data.presentationColor
      ? data.presentationColor
      : DEFAULT_BORDER;
  const background = mixWithWhite(color, 0.85);
  const shadow = hexToRgba(color, 0.2);

  // Бейдж «📖 N» — число разных продуктов-источников, которые держит узел
  // (вычисляется в Flow.tsx и приходит в data.sourcesBadgeCount).
  const sourcesBadgeCount =
    typeof data.sourcesBadgeCount === "number" ? data.sourcesBadgeCount : 0;

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

      {sourcesBadgeCount > 0 && (
        <div
          title={`Источники из ${sourcesBadgeCount} продукт(ов)`}
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 6px",
            borderRadius: 999,
            background: color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            zIndex: 11,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
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
          {sourcesBadgeCount}
        </div>
      )}

      <div style={{ fontSize: "12px", lineHeight: "1.3" }}>{data.label}</div>

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
