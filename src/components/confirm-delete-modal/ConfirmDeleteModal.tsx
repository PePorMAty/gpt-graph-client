import { useEffect, type FC } from "react";
import styles from "./ConfirmDeleteModal.module.css";

interface ConfirmDeleteModalProps {
  nodeName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: FC<ConfirmDeleteModalProps> = ({
  nodeName,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>
          Удалить узел &laquo;{nodeName}&raquo;?
        </h3>
        <p className={styles.warning}>Это действие нельзя отменить.</p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Отмена
          </button>
          <button className={styles.deleteBtn} onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
};
