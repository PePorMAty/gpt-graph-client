import { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { ContinueGraphButton } from "../continue-graph-button";
import {
  getGraphData,
  getPromptLayoutFromServer,
} from "../../store/api/graph-api";

import styles from "./RequsetPanel.module.css";

export const RequestPanel = () => {
  const dispatch = useAppDispatch();
  const { leafNodes, originalPrompt, isLoading } = useAppSelector(
    (state) => state.graph
  );

  const [value, setValue] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"create" | "combine" | "continue">(
    "create"
  );

  // TEMPLATE PROMPT TEXTAREA
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptLayout, setPromptLayout] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const loadPromptLayout = async () => {
      try {
        const layout = await getPromptLayoutFromServer();
        setPromptLayout(layout); // ← подставляем в textarea
      } catch (err) {
        console.error("Ошибка загрузки шаблона промта:", err);
      }
    };

    loadPromptLayout();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [promptLayout]);

  const resetPromptLayout = () => setPromptLayout("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleOnClick = () => {
    if (!value.trim()) return;

    dispatch(
      getGraphData({
        promptValue: value,
        promptLayout,
      })
    );
  };

  return (
    <div className={styles.panel}>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={activeTab === "create" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("create")}
        >
          Создать граф
        </button>

        <button
          className={activeTab === "continue" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("continue")}
        >
          Продолжить граф
        </button>

        <button
          className={activeTab === "combine" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("combine")}
        >
          Объединить графы
        </button>
      </div>

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <div className={styles.input_wrapper}>
          {/* Accordion header */}
          <div
            className={styles.accordionHeader}
            onClick={() => setShowPromptEditor(!showPromptEditor)}
          >
            <span>Шаблон промта</span>

            <svg
              className={`${styles.accordionArrow} ${
                showPromptEditor ? styles.open : ""
              }`}
              viewBox="0 0 24 24"
            >
              <path d="M8 5l8 7-8 7" />
            </svg>
          </div>

          {/* Accordion content */}
          <div
            className={`${styles.accordionContent} ${
              showPromptEditor ? styles.open : ""
            }`}
          >
            <button
              className={styles.resetButton}
              onClick={resetPromptLayout}
              type="button"
            >
              Сбросить шаблон
            </button>

            <textarea
              ref={textareaRef}
              className={styles.promptTextarea}
              placeholder="Введите или измените шаблон промта..."
              value={promptLayout}
              onChange={(e) => setPromptLayout(e.target.value)}
              disabled={isLoading}
            />
          </div>

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

      {/* CONTINUE TAB */}
      {activeTab === "continue" && (
        <div className={styles.continueSection}>
          <h3>Продолжение графа</h3>

          {originalPrompt ? (
            <>
              <div className={styles.promptInfo}>
                <p>
                  <strong>Текущий запрос:</strong> {originalPrompt}
                </p>
                <p>
                  <strong>Узлов для детализации:</strong> {leafNodes.length}
                </p>
              </div>

              {leafNodes.length > 0 ? (
                <div className={styles.continueInfo}>
                  <ContinueGraphButton />
                </div>
              ) : (
                <div className={styles.noContinue}>
                  <p>⏸️ Нет узлов для продолжения</p>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noContinue}>
              <p>⏸️ Сначала создайте граф</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
