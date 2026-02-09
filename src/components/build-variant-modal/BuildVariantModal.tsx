import type { FC } from "react";
import styles from "./BuildVariantModal.module.css";

type Alternative = {
  Название: string;
  Шаги: string[];
};

interface BuildVariantModalProps {
  isOpen: boolean;
  productLabel?: string;

  alternatives: Alternative[];

  onMain: () => void;
  onAlt: (name: string) => void;
  onClose: () => void;
}

export const BuildVariantModal: FC<BuildVariantModalProps> = ({
  isOpen,
  productLabel,
  alternatives,
  onMain,
  onAlt,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Вариант построения</h3>
          <button className={styles.close} onClick={onClose}>
            ✖
          </button>
        </div>

        {productLabel && (
          <p className={styles.subtitle}>
            Узел: <b>{productLabel}</b>
          </p>
        )}

        <div className={styles.section}>
          <button className={styles.primary} onClick={onMain}>
            ✅ Основной вариант (сводная технология)
          </button>
        </div>

        {alternatives?.length > 0 ? (
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Альтернативы:</p>

            <div className={styles.list}>
              {alternatives.map((a) => (
                <button
                  key={a["Название"]}
                  className={styles.altButton}
                  onClick={() => onAlt(a["Название"])}
                  title={a["Шаги"]?.join(" → ")}
                >
                  {a["Название"]}
                </button>
              ))}
            </div>

            <p className={styles.hint}>
              Подсказка: наведи курсор на альтернативу, чтобы увидеть шаги.
            </p>
          </div>
        ) : (
          <div className={styles.section}>
            <p className={styles.hint}>Альтернативы не найдены.</p>
          </div>
        )}
      </div>
    </div>
  );
};
