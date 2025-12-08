import styles from "./AddNodeModal.module.css";

export const AddNodeModal = ({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: "product" | "transformation") => void;
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.window}>
        <h3>Выберите тип узла</h3>

        <button onClick={() => onSelect("product")}>Продукт</button>

        <button onClick={() => onSelect("transformation")}>
          Преобразование
        </button>

        <button className={styles.close} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
};
