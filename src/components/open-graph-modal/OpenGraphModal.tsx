import type { FC } from "react";
import styles from "./OpenGraphModal.module.css";

interface OpenGraphModalProps {
  isOpen: boolean;
  onFull: () => void;
  onPartial: () => void;
  onClose: () => void;
}

export const OpenGraphModal: FC<OpenGraphModalProps> = ({
  isOpen,
  onFull,
  onPartial,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Как открыть граф?</h3>

        <div className={styles.actions}>
          <button onClick={onFull}>📂 Открыть полностью</button>
          <button onClick={onPartial}>🔍 Открыть узел</button>
        </div>

        <button className={styles.close} onClick={onClose}>
          ✖
        </button>
      </div>
    </div>
  );
};
