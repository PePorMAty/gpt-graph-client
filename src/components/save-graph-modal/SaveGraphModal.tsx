import { useEffect, useState, type FC } from "react";
import styles from "./SaveGraphModal.module.css";

interface SaveGraphModalProps {
  isOpen: boolean;
  defaultName: string;
  onClose: () => void;
  onSave: (name?: string) => void;
  /** Имя открытого сохранённого графа — если задано, показываем «Обновить «имя»». */
  openedName?: string | null;
  /** Перезаписать открытый сохранённый граф текущим состоянием полотна. */
  onUpdate?: () => void;
  /** Заголовок модалки (для переиспользования под переименование). */
  title?: string;
  /** Подпись основной кнопки (напр. «Переименовать»). */
  confirmLabel?: string;
}

export const SaveGraphModal: FC<SaveGraphModalProps> = ({
  isOpen,
  defaultName,
  onClose,
  onSave,
  openedName,
  onUpdate,
  title = "💾 Сохранить граф",
  confirmLabel,
}) => {
  const [name, setName] = useState(defaultName);

  // Синхронизируем поле имени при каждом открытии модалки.
  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const canUpdate = !!openedName && !!onUpdate;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h3>{title}</h3>

        {canUpdate && (
          <p className={styles.hint}>
            Открыт сохранённый граф «{openedName}». Обновить его или сохранить
            как новый?
          </p>
        )}

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название нового графа (необязательно)"
        />

        <div className={styles.actions}>
          <button onClick={onClose}>Отмена</button>
          {canUpdate && (
            <button className={styles.primary} onClick={onUpdate}>
              Обновить «{openedName}»
            </button>
          )}
          <button onClick={() => onSave(name)}>
            {confirmLabel ?? (canUpdate ? "Сохранить как новый" : "Сохранить")}
          </button>
        </div>
      </div>
    </div>
  );
};
