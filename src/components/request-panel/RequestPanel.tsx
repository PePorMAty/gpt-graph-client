import { useState, useEffect } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { ContinueGraphButton } from "../continue-graph-button";
import { getGraphData } from "../../store/api/graph-api";

import styles from "./RequsetPanel.module.css";

export const RequestPanel = () => {
  const dispatch = useAppDispatch();
  const { hasMore, leafNodes, originalPrompt, isLoading } = useAppSelector(
    (state) => state.graph
  );
  const [value, setValue] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"create" | "combine" | "continue">(
    "create"
  );
  const [hasUserPrompt, setHasUserPrompt] = useState(false);

  // Отслеживаем, есть ли сохраненный промпт
  useEffect(() => {
    setHasUserPrompt(!!originalPrompt);
  }, [originalPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
  };

  const handleOnClick = () => {
    if (value.trim()) {
      dispatch(getGraphData(value));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <button
          className={activeTab === "create" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("create")}
        >
          Создать граф
        </button>
        <button
          className={activeTab === "combine" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("combine")}
        >
          Объединить графы
        </button>
        <button
          className={activeTab === "continue" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("continue")}
        >
          Продолжить граф
        </button>
      </div>

      {activeTab === "create" && (
        <div className={styles.input_wrapper}>
          <input
            className={styles.input}
            value={value}
            onChange={handleChange}
            placeholder="Введите описание продукта или процесса..."
            onKeyPress={(e) => e.key === "Enter" && handleOnClick()}
            disabled={isLoading}
          />
          <button
            className={styles.button}
            onClick={handleOnClick}
            disabled={!value.trim() || isLoading}
          >
            {isLoading ? "Создание..." : "Создать граф"}
          </button>
        </div>
      )}

      {activeTab === "continue" && (
        <div className={styles.continueSection}>
          <h3>Продолжение графа</h3>

          {hasUserPrompt ? (
            <>
              <div className={styles.promptInfo}>
                <p>
                  <strong>Текущий запрос:</strong> {originalPrompt}
                </p>
                <p>
                  <strong>Узлов для детализации:</strong> {leafNodes.length}
                </p>
                {leafNodes.length > 0 && (
                  <p className={styles.hint}>
                    Узлы без исходящих связей готовы для детализации
                  </p>
                )}
              </div>

              {hasMore && leafNodes.length > 0 ? (
                <div className={styles.continueInfo}>
                  <ContinueGraphButton />
                </div>
              ) : (
                <div className={styles.noContinue}>
                  <p>⏸️ Нет узлов для продолжения</p>
                  <p className={styles.hint}>
                    Сначала создайте граф, затем вернитесь сюда для детализации
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noContinue}>
              <p>⏸️ Сначала создайте граф</p>
              <p className={styles.hint}>
                Перейдите на вкладку "Создать граф" и введите описание продукта
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
