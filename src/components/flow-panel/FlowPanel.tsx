import { useEffect, useRef, type FC } from "react";

import type { FlowPanelProps } from "./types";
import styles from "./FlowPanel.module.css";

export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  onDelete,
  descriptionValue,
  onChangeDescription,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Закрытие при клике вне панели
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef?.current?.contains(event.target)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose(); // Закрываем панель после удаления
    }
  };

  return (
    <>
      {/* Overlay для блокировки графа */}
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      {/* Панель редактирования */}
      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Редактирование узла</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.panelContent}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Название узла:</label>
            <input
              value={value}
              onChange={onChangeValue}
              className={styles.formInput}
              placeholder="Введите название узла"
            />
          </div>

          {/* Место для будущего textarea */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Описание:</label>
            <textarea
              value={descriptionValue}
              onChange={onChangeDescription}
              className={styles.formTextarea}
              placeholder="Введите описание узла"
              rows={4}
            />
          </div>
          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={handleDelete}
              className={styles.deleteButton}
            >
              Удалить узел
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
