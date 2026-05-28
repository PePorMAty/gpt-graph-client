import { useEffect } from "react";

import styles from "./MergeReportModal.module.css";

export interface MergeReportRow {
  label: string;
  presentations: string[];
  /** Оригинальное написание этого продукта в каждой презентации
   * (показывается в скобках рядом с именем презентации). */
  labelsByPresentation?: Record<string, string>;
}

interface MergeReportModalProps {
  presentationName: string | null;
  commonNodes: MergeReportRow[];
  addedCount: number;
  onClose: () => void;
}

export const MergeReportModal: React.FC<MergeReportModalProps> = ({
  presentationName,
  commonNodes,
  addedCount,
  onClose,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className={styles.title}>
          {presentationName
            ? `Граф «${presentationName}» добавлен`
            : "Граф добавлен"}
        </h3>

        <p className={styles.summary}>
          Новых узлов: <strong>{addedCount}</strong>. Общих узлов с
          существующим графом: <strong>{commonNodes.length}</strong>.
        </p>

        {commonNodes.length === 0 ? (
          <p className={styles.empty}>
            Совпадений по названию не найдено — новых общих узлов не появилось.
          </p>
        ) : (
          <>
            <p className={styles.sectionTitle}>
              Эти узлы стали общими с другими презентациями:
            </p>
            <ul className={styles.list}>
              {commonNodes.map((row) => {
                const presText = row.presentations
                  .map((p) => {
                    const original = row.labelsByPresentation?.[p];
                    return original && original !== row.label
                      ? `${p} (${original})`
                      : `${p} (${row.label})`;
                  })
                  .join(" + ");
                return (
                  <li key={row.label} className={styles.item}>
                    <span className={styles.label}>{row.label}</span>
                    <span className={styles.pres}>{presText}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.okButton}
            onClick={onClose}
            autoFocus
          >
            ОК
          </button>
        </div>
      </div>
    </div>
  );
};
