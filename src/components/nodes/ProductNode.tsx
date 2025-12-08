import { Handle, Position } from "@xyflow/react";
import React from "react";
import type { ProductNodeProps } from "../../types";

export const ProductNode: React.FC<ProductNodeProps> = ({ data }) => {
  return (
    <div
      style={{
        background: "#e3f2fd",
        padding: "15px",
        borderRadius: "8px",
        border: "2px solid #2196f3",
        minWidth: "180px",
        maxWidth: "250px",
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(33, 150, 243, 0.2)",
        position: "relative", // Важно для правильного позиционирования
        zIndex: 10,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#2196f3",
          width: 8,
          height: 8,
        }}
      />
      <div
        style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "14px" }}
      >
        🛒 Продукт
      </div>
      <div style={{ fontSize: "12px", lineHeight: "1.3" }}>{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#2196f3",
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
};
