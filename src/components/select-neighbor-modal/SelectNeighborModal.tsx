import { useEffect, useState, type FC } from "react";
import styles from "./SelectNeighborModal.module.css";
import type { DirectProductNeighbor } from "../../utils/getDirectProductNeighbors";

interface SelectNeighborModalProps {
  productLabel: string;
  neighbors: DirectProductNeighbor[];
  loading?: boolean;
  error?: string | null;
  defaultSystemPrompt: string;
  customSystemPrompt: string;
  isPromptDirty: boolean;
  onChangeCustomSystemPrompt: (value: string) => void;
  onResetSystemPrompt: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const SelectNeighborModal: FC<SelectNeighborModalProps> = ({
  productLabel,
  neighbors,
  loading,
  error,
  defaultSystemPrompt,
  customSystemPrompt,
  isPromptDirty,
  onChangeCustomSystemPrompt,
  onResetSystemPrompt,
  onConfirm,
  onClose,
}) => {
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, loading]);

  const isEmpty = neighbors.length === 0;
  const displayedPrompt = customSystemPrompt || defaultSystemPrompt;

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>
          Получить преобразования к соседним продуктам
        </h3>
        <p className={styles.subtitle}>
          От «{productLabel}» — будут запрошены преобразования ко всем прямым
          соседним продуктам:
        </p>

        {isEmpty ? (
          <div className={styles.empty}>
            У этого продукта нет прямых исходящих продуктов-соседей.
          </div>
        ) : (
          <ul className={styles.list}>
            {neighbors.map((n) => (
              <li key={n.edgeId} className={styles.itemStatic}>
                <span className={styles.label}>
                  {n.neighborLabel || n.neighborNodeId}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.promptBlock}>
          <button
            type="button"
            className={styles.promptToggle}
            onClick={() => setIsPromptOpen((v) => !v)}
            disabled={loading}
          >
            {isPromptOpen ? "▾" : "▸"} Системный промпт
            {isPromptDirty ? " (изменён)" : ""}
          </button>
          {isPromptOpen && (
            <>
              <textarea
                className={styles.promptTextarea}
                value={displayedPrompt}
                onChange={(e) => onChangeCustomSystemPrompt(e.target.value)}
                disabled={loading}
                rows={10}
                spellCheck={false}
              />
              <button
                type="button"
                className={styles.promptReset}
                onClick={onResetSystemPrompt}
                disabled={loading || !isPromptDirty}
              >
                Сбросить к дефолту
              </button>
            </>
          )}
        </div>

        {error && (
          <div
            className={styles.subtitle}
            style={{ marginTop: 8, color: "#ff8a80" }}
          >
            Ошибка: {error}
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.close}
            onClick={onClose}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            className={styles.primary}
            onClick={onConfirm}
            disabled={loading || isEmpty}
          >
            {loading
              ? "Запрос…"
              : error
                ? "Повторить"
                : "Получить преобразования"}
          </button>
        </div>
      </div>
    </div>
  );
};
