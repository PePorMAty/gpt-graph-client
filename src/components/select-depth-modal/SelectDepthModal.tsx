import { useState, type FC } from "react";
import styles from "./SelectDepthModal.module.css";

interface SelectDepthModalProps {
  nodeLabel: string;
  maxUp: number;
  maxDown: number;
  onConfirm: (up: number, down: number) => void;
  onClose: () => void;
}

export const SelectDepthModal: FC<SelectDepthModalProps> = ({
  nodeLabel,
  maxUp,
  maxDown,
  onConfirm,
  onClose,
}) => {
  const [up, setUp] = useState(Math.min(2, maxUp));
  const [down, setDown] = useState(Math.min(2, maxDown));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Уровни для узла</h3>
        <p className={styles.nodeName}>{nodeLabel}</p>

        <div className={styles.controls}>
          <label>
            ⬆️ Вверх:
            <input
              type="number"
              min={0}
              max={maxUp}
              value={up}
              onChange={(e) => setUp(Number(e.target.value))}
            />
            <span> / {maxUp}</span>
          </label>

          <label>
            ⬇️ Вниз:
            <input
              type="number"
              min={0}
              max={maxDown}
              value={down}
              onChange={(e) => setDown(Number(e.target.value))}
            />
            <span> / {maxDown}</span>
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose}>
            Отмена
          </button>
          <button onClick={() => onConfirm(up, down)}>Открыть</button>
        </div>
      </div>
    </div>
  );
};
