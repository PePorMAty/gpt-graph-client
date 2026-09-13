import { useEffect, useState, type FC } from "react";

import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
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
  title = "Сохранить граф",
  confirmLabel,
}) => {
  const [name, setName] = useState(defaultName);

  // Синхронизируем поле имени при каждом открытии модалки.
  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  const canUpdate = !!openedName && !!onUpdate;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      size={canUpdate ? "m" : "s"}
      subtitle={
        canUpdate
          ? `Открыт сохранённый граф «${openedName}». Обновить его или сохранить как новый?`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          {canUpdate && (
            <Button onClick={() => onSave(name)}>Сохранить как новый</Button>
          )}
          <Button
            variant="primary"
            onClick={canUpdate ? onUpdate : () => onSave(name)}
          >
            {canUpdate
              ? `Обновить «${openedName}»`
              : (confirmLabel ?? "Сохранить")}
          </Button>
        </>
      }
    >
      <label className={styles.label} htmlFor="save-graph-name">
        Название графа
      </label>
      <input
        id="save-graph-name"
        className={styles.input}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave(name)}
        placeholder="Название нового графа (необязательно)"
        autoFocus
      />
    </Modal>
  );
};
