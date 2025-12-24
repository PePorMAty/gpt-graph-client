import { useState, type FC } from "react";
import styles from "./SaveGraphModal.module.css";

interface SaveGraphModalProps {
  isOpen: boolean;
  defaultName: string;
  onClose: () => void;
  onSave: (name?: string) => void;
}

export const SaveGraphModal: FC<SaveGraphModalProps> = ({
  isOpen,
  defaultName,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(defaultName);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h3>💾 Сохранить граф</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название графа (необязательно)"
        />
        <div className={styles.actions}>
          <button onClick={onClose}>Отмена</button>
          <button onClick={() => onSave(name)}>Сохранить</button>
        </div>
      </div>
    </div>
  );
};
