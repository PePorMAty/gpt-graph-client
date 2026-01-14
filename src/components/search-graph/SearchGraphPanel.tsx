// components/graph-search/GraphSearchPanel.tsx
import { useState } from "react";
import { useReactFlow } from "@xyflow/react";

import type { CustomNode } from "../../types";
import { useAppSelector } from "../../store/hooks";
import { useGraphSearch } from "../../hooks/useGraphSearch";
import styles from "./SearchGraphPanel.module.css";

export const SearchGraphPanel = ({ onClose }: { onClose: () => void }) => {
  const [value, setValue] = useState("");
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const results = useGraphSearch(nodes, value, 300);
  const { setCenter } = useReactFlow();

  const selectNode = (node: CustomNode) => {
    setCenter(node.position.x, node.position.y, {
      zoom: 1.3,
      duration: 600,
    });

    window.dispatchEvent(
      new CustomEvent("highlight-node", { detail: node.id })
    );

    onClose();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <strong>Поиск</strong>
        <button onClick={onClose}>✕</button>
      </div>

      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Введите название..."
      />

      <ul className={styles.results}>
        {results.map((n) => (
          <li
            key={n.id}
            onClick={() => selectNode(n)}
            className={
              n.type === "transformation"
                ? `${styles.transformation}`
                : `${styles.product}`
            }
          >
            {n.data.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
