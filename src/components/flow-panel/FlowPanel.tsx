import { useEffect, useRef, useState, type FC } from "react";

import type { FlowPanelProps } from "./types";
import styles from "./FlowPanel.module.css";
import { LinkifiedText } from "../linkified-text";

export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  onDelete,
  descriptionValue,
  onChangeDescription,
  onFindSources,
  nodeType,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);

  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Закрытие при клике вне панели
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
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

  // если панель закрыли — выходим из режима редактирования описания
  useEffect(() => {
    if (!isOpen) setIsEditingDescription(false);
  }, [isOpen]);

  // автофокус в textarea при входе в режим редактирования
  useEffect(() => {
    if (isEditingDescription) {
      // next tick, чтобы DOM точно был
      setTimeout(() => {
        descRef.current?.focus();
        // курсор в конец
        const len = descRef.current?.value?.length ?? 0;
        descRef.current?.setSelectionRange(len, len);
      }, 0);
    }
  }, [isEditingDescription]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  const openDescEditor = () => setIsEditingDescription(true);
  const closeDescEditor = () => setIsEditingDescription(false);

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

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

          {/* ✅ ОДНО поле описания: либо превью, либо textarea */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Описание:</label>

            {!isEditingDescription ? (
              <div
                className={styles.previewBox}
                onDoubleClick={openDescEditor}
                title="Двойной клик — редактировать"
              >
                {descriptionValue?.trim() ? (
                  // кликабельные ссылки прямо внутри текста
                  <LinkifiedText text={descriptionValue} />
                ) : (
                  <span className={styles.previewPlaceholder}>
                    (двойной клик, чтобы добавить описание)
                  </span>
                )}
              </div>
            ) : (
              <textarea
                ref={descRef}
                value={descriptionValue}
                onChange={onChangeDescription}
                onBlur={closeDescEditor}
                className={styles.formTextarea}
                placeholder="Введите описание узла"
                rows={6}
              />
            )}
          </div>

          {/* ✅ Кнопка только для product */}
          {onFindSources && nodeType === "product" && (
            <div className={styles.formGroup}>
              <button
                type="button"
                onClick={onFindSources}
                className={styles.findSourcesButton}
              >
                🔎 Найти источники / построить
              </button>
            </div>
          )}

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
