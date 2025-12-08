import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { TransformationNodeProps } from "../../types";

export const TransformationNode: React.FC<TransformationNodeProps> = ({
  data,
}) => {
  return (
    <div
      style={{
        background: "#fff3e0",
        padding: "15px",
        borderRadius: "8px",
        border: "2px solid #ff9800",
        minWidth: "180px",
        maxWidth: "250px",
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(255, 152, 0, 0.2)",
        position: "relative", // Важно для правильного позиционирования
        zIndex: 10,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#ff9800",
          width: 8,
          height: 8,
        }}
      />
      <div
        style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "14px" }}
      >
        ⚙️ Преобразование
      </div>
      <div style={{ fontSize: "12px", lineHeight: "1.3" }}>{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#ff9800",
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
};
