import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { TransformationNodeProps } from "../../types";
import { nodeBoxStyle } from "./nodeBox";

export const TransformationNode: React.FC<TransformationNodeProps> = ({
  data,
}) => {
  const isAlt = data.chainVariant === "alt";

  const accentColor = isAlt ? "#a855f7" : "#ff9800";
  const box = nodeBoxStyle(data.focusCompact === true);

  return (
    <div
      style={{
        background: isAlt ? "#f3e8ff" : "#fff3e0",
        padding: box.padding,
        borderRadius: "8px",
        border: `2px solid ${accentColor}`,
        minWidth: box.minWidth,
        maxWidth: box.maxWidth,
        textAlign: "center",
        boxShadow: isAlt
          ? "0 2px 8px rgba(168, 85, 247, 0.2)"
          : "0 2px 8px rgba(255, 152, 0, 0.2)",
        position: "relative",
        zIndex: 10,
      }}
    >
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        style={{ background: accentColor, width: 8, height: 8 }}
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        style={{ opacity: 0, width: 8, height: 8, pointerEvents: "none" }}
      />
      <div style={{ fontSize: box.fontSize, lineHeight: box.lineHeight }}>
        {data.label}
      </div>
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{ background: accentColor, width: 8, height: 8 }}
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
