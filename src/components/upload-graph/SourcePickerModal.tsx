import { useEffect, useState } from "react";

import {
  fetchSavedGraphs,
} from "../../store/api/saved-graph-api";
import type { SavedGraphMeta } from "../../store/types";

import styles from "./SourcePickerModal.module.css";

interface SourcePickerModalProps {
  mode: "replace" | "merge";
  onPickFile: () => void;
  onPickSaved: (id: string, name: string) => void;
  onClose: () => void;
}

const TITLES = {
  replace: "Загрузить граф",
  merge: "Добавить граф",
} as const;

export const SourcePickerModal: React.FC<SourcePickerModalProps> = ({
  mode,
  onPickFile,
  onPickSaved,
  onClose,
}) => {
  const [list, setList] = useState<SavedGraphMeta[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const items = await fetchSavedGraphs();
        if (!cancelled) setList(items);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось загрузить список сохранённых графов",
          );
          setList([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className={styles.title}>{TITLES[mode]}</h3>
        <p className={styles.subtitle}>Откуда взять граф?</p>

        <button
          type="button"
          className={styles.fileButton}
          onClick={onPickFile}
        >
          📂 Выбрать файл .json…
        </button>

        <div className={styles.divider}>
          <span>или из сохранённых на сервере</span>
        </div>

        {isLoading && <p className={styles.placeholder}>Загрузка списка…</p>}

        {!isLoading && error && (
          <p className={styles.error}>⚠️ {error}</p>
        )}

        {!isLoading && !error && list && list.length === 0 && (
          <p className={styles.placeholder}>Нет сохранённых графов.</p>
        )}

        {!isLoading && list && list.length > 0 && (
          <ul className={styles.list}>
            {list.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => onPickSaved(g.id, g.name)}
                  title={`Загрузить «${g.name}»`}
                >
                  <span className={styles.itemName}>{g.name}</span>
                  <span className={styles.itemMeta}>
                    {new Date(g.createdAt).toLocaleString()}
                    {typeof g.leafCount === "number" && (
                      <> · leaf: {g.leafCount}</>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
