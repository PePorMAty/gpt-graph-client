import { useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { SavedGraph } from "../saved-graph";
import { UploadGraphTab } from "../upload-graph";
import { ContinueGraphButton } from "../continue-graph-button";
import styles from "./LibraryScreen.module.css";

type Tab = "saved" | "combine" | "continue";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "saved", label: "Сохранённые графы" },
  { id: "combine", label: "Объединение графов" },
  { id: "continue", label: "Продолжение графа" },
];

/**
 * Библиотека: сохранённые графы, объединение и продолжение.
 *
 * Временная раскладка — сюда переехало содержимое прежней нижней панели,
 * чтобы работа с сохранёнными графами не пропала вместе с ней. Собственный
 * дизайн раздела появится отдельно.
 */
export const LibraryScreen = () => {
  const [tab, setTab] = useState<Tab>("saved");
  const { leafNodes, originalPrompt } = useAppSelector((s) => s.graph);

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          {tab === "saved" && <SavedGraph />}
          {tab === "combine" && <UploadGraphTab />}
          {tab === "continue" && (
            <div className={styles.continue}>
              {originalPrompt ? (
                <>
                  <div className={styles.continueRow}>
                    <span className={styles.continueLabel}>Текущий запрос</span>
                    <span className={styles.continueValue}>{originalPrompt}</span>
                  </div>
                  <div className={styles.continueRow}>
                    <span className={styles.continueLabel}>
                      Узлов для детализации
                    </span>
                    <span className={styles.continueValue}>
                      {leafNodes.length}
                    </span>
                  </div>
                  {leafNodes.length > 0 ? (
                    <ContinueGraphButton />
                  ) : (
                    <div className={styles.note}>
                      Нет узлов для продолжения — цепочка раскрыта до конца.
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.note}>
                  Сначала создайте граф на вкладке «Граф».
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
