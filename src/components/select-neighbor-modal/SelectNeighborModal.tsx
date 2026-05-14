import { useEffect, type FC } from "react";
import styles from "./SelectNeighborModal.module.css";
import type { DirectProductNeighbor } from "../../utils/getDirectProductNeighbors";

interface SelectNeighborModalProps {
  productLabel: string;
  neighbors: DirectProductNeighbor[];
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const SelectNeighborModal: FC<SelectNeighborModalProps> = ({
  productLabel,
  neighbors,
  loading,
  error,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, loading]);

  const isEmpty = neighbors.length === 0;

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
