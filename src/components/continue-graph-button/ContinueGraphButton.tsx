import React, { useState, useEffect } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { continueGraph } from "../../store/api/graph-api";

import styles from "./ContinueGraphButton.module.css";

export const ContinueGraphButton: React.FC = () => {
  const dispatch = useAppDispatch();
  const { leafNodes, isLoading, data } = useAppSelector((state) => state.graph);

  const [selectedLeafNodes, setSelectedLeafNodes] = useState<string[]>([]);

  // При изменении leafNodes выбираем первые несколько узлов для детализации
  useEffect(() => {
    if (leafNodes && leafNodes.length > 0) {
      setSelectedLeafNodes(leafNodes.slice(0, Math.min(3, leafNodes.length)));
    } else {
      setSelectedLeafNodes([]);
    }
  }, [leafNodes]);

  const handleContinue = () => {
    if (selectedLeafNodes.length > 0) {
      dispatch(continueGraph({ selectedLeafNodes }));
    }
  };

  const handleReset = () => {};

  // Если нет leafNodes или они пустые
  if (!leafNodes || leafNodes.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <h4>🔍 Узлы для детализации</h4>
        <p>Вы можете добавить детализацию для {leafNodes.length} узлов</p>

        <div className={styles.selectedNodes}>
          <p>Будут детализированы:</p>
          <ul>
            {selectedLeafNodes.slice(0, 3).map((nodeId) => {
              const node = data.nodes.find((n) => n.id === nodeId);
              return (
                <li key={nodeId} title={nodeId}>
                  {node?.data?.label || nodeId}
                </li>
              );
            })}
            {selectedLeafNodes.length > 3 && (
              <li>... и еще {selectedLeafNodes.length - 3} узлов</li>
            )}
          </ul>
        </div>
      </div>

      <div className={styles.buttons}>
        <button
          onClick={handleContinue}
          disabled={isLoading || selectedLeafNodes.length === 0}
          className={styles.continueButton}
        >
          {isLoading ? "Детализация..." : `➕ Детализировать граф`}
        </button>

        <button onClick={handleReset} className={styles.resetButton}>
          Скрыть
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Всего узлов:</span>
          <span className={styles.statValue}>{data.nodes.length}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Для детализации:</span>
          <span className={styles.statValue}>{leafNodes.length}</span>
        </div>
      </div>
    </div>
  );
};
