import { useEffect, type FC, type ReactNode } from "react";
import styles from "./ConfirmDeleteModal.module.css";

interface ConfirmDeleteModalProps {
  nodeName: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Кастомный заголовок. Если не задан — используется
   * стандартный «Удалить узел «{nodeName}»?». */
  title?: ReactNode;
  /** Кастомный текст под заголовком. Если не задан — «Это действие
   * нельзя отменить.». */
  description?: ReactNode;
  /** Лейбл кнопки подтверждения. По умолчанию «Удалить». */
  confirmLabel?: string;
}

export const ConfirmDeleteModal: FC<ConfirmDeleteModalProps> = ({
  nodeName,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = "Удалить",
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
          {title ?? <>Удалить узел &laquo;{nodeName}&raquo;?</>}
        </h3>
        <p className={styles.warning}>
          {description ?? "Это действие нельзя отменить."}
        </p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Отмена
          </button>
          <button className={styles.deleteBtn} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
