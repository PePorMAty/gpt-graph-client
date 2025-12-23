import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { continueGraph } from "../../store/api/graph-api";

import styles from "./ContinueGraphButton.module.css";

export const ContinueGraphButton: React.FC = () => {
  const dispatch = useAppDispatch();
  const { leafNodes, isLoading, data } = useAppSelector((state) => state.graph);
  const saveLeafNodes = useAppSelector(
    (state) => state.savedGraphs.selectedGraph
  );
  const [selectedLeafNodes, setSelectedLeafNodes] = useState<string[]>([]);

  console.log(saveLeafNodes);

  // по умолчанию выбираем все leaf_nodes
  useEffect(() => {
    setSelectedLeafNodes(leafNodes);
  }, [leafNodes]);

  const toggleNode = (id: string) => {
    setSelectedLeafNodes((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (selectedLeafNodes.length === 0) return;

    dispatch(continueGraph({ selectedLeafNodes }));
  };

  if (!leafNodes || leafNodes.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h4>🔍 Выберите узлы для продолжения</h4>

      <ul className={styles.nodeList}>
        {leafNodes.map((nodeId) => {
          const node = data.nodes.find((n) => n.id === nodeId);

          return (
            <li key={nodeId}>
              <label className={styles.nodeCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedLeafNodes.includes(nodeId)}
                  onChange={() => toggleNode(nodeId)}
                />
                <span className={styles.nodeLabel}>
                  {node?.data?.label || nodeId}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        className={styles.continueButton}
        onClick={handleContinue}
        disabled={isLoading || selectedLeafNodes.length === 0}
      >
        {isLoading
          ? "Детализация..."
          : `➕ Детализировать (${selectedLeafNodes.length})`}
      </button>
    </div>
  );
};
