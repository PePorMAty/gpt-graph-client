import { useEffect, useMemo, useState, type FC } from "react";
import styles from "./SelectNeighborModal.module.css";
import type { DirectProductNeighbor } from "../../utils/getDirectProductNeighbors";

interface SelectNeighborModalProps {
  productLabel: string;
  neighbors: DirectProductNeighbor[];
  loading?: boolean;
  error?: string | null;
  onSelect: (neighbor: DirectProductNeighbor) => void;
  onClose: () => void;
}

export const SelectNeighborModal: FC<SelectNeighborModalProps> = ({
  productLabel,
  neighbors,
  loading,
  error,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return neighbors;
    return neighbors.filter((n) =>
      (n.neighborLabel || "").toLowerCase().includes(q),
    );
  }, [query, neighbors]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Получить преобразование с соседом</h3>
        <p className={styles.subtitle}>
          От «{productLabel}» — выберите смежный продукт.
        </p>

        <input
          className={styles.search}
          placeholder="Поиск..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {neighbors.length === 0 ? (
          <div className={styles.empty}>
            У этого продукта нет прямых product↔product соседей.
          </div>
        ) : (
          <ul className={styles.list}>
            {filtered.map((n) => (
              <li
                key={n.edgeId}
                className={styles.item}
                onClick={() => !loading && onSelect(n)}
              >
                <span className={styles.label}>
                  {n.neighborLabel || n.neighborNodeId}
                </span>
                <span className={styles.role}>
                  {n.role === "outgoing" ? "→ исходящий" : "← входящий"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {loading && (
          <div className={styles.subtitle} style={{ marginTop: 8 }}>
            Получение преобразования...
          </div>
        )}
        {error && (
          <div
            className={styles.subtitle}
            style={{ marginTop: 8, color: "#ff8a80" }}
          >
            Ошибка: {error}
          </div>
        )}

        <button className={styles.close} onClick={onClose} disabled={loading}>
          Закрыть
        </button>
      </div>
    </div>
  );
};
