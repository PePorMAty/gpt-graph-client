import { useState, useMemo, type FC } from "react";
import styles from "./SelectNodeModal.module.css";
import type { GPTNode } from "../../types";

interface SelectNodeModalProps {
  onSelect: (nodeId: string) => void;
  onClose: () => void;
  nodes: GPTNode[];
}

export const SelectNodeModal: FC<SelectNodeModalProps> = ({
  nodes,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return nodes.filter((n) => n.data.label.toLowerCase().includes(q));
  }, [query, nodes]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Выберите узел</h3>

        <input
          className={styles.search}
          placeholder="Поиск узла..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className={styles.list}>
          {filtered.map((n) => {
            const name = n.data?.label ?? n.data?.name ?? n.id;

            return (
              <li
                key={n.id}
                className={styles.item}
                onClick={() => onSelect(n.id)}
              >
                {name}
              </li>
            );
          })}
        </ul>

        <button className={styles.close} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
};
