import { useEffect } from "react";

import styles from "./MergeReportModal.module.css";

export interface MergeReportRow {
  label: string;
  presentations: string[];
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
              {commonNodes.map((row) => (
                <li key={row.label} className={styles.item}>
                  <span className={styles.label}>{row.label}</span>
                  <span className={styles.pres}>
                    {row.presentations.join(" + ")}
                  </span>
                </li>
              ))}
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
