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

      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{ background: color, width: 8, height: 8 }}
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        style={{ opacity: 0, width: 8, height: 8, pointerEvents: "none" }}
      />

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

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{ background: color, width: 8, height: 8 }}
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        style={{ opacity: 0, width: 8, height: 8, pointerEvents: "none" }}
      />
    </div>
  );
};
