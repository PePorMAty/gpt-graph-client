import { useEffect, type FC } from "react";
import type { StepChainApiStep } from "../../store/types";
import styles from "./StepPreviewModal.module.css";

interface StepPreviewModalProps {
  step: StepChainApiStep;
  stepNumber: number;
  onAccept: () => void;
  onRetry: () => void;
  onReject: () => void;
}

export const StepPreviewModal: FC<StepPreviewModalProps> = ({
  step,
  stepNumber,
  onAccept,
  onRetry,
  onReject,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onReject();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onReject]);

  return (
    <div className={styles.overlay} onClick={onReject}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Превью шага #{stepNumber}</h3>

        <div className={styles.transformationName}>
          {step.transformation.name}
        </div>

        {step.transformation.description && (
          <div className={styles.transformationDesc}>
            {step.transformation.description}
          </div>
        )}

        {step.inputProducts.length > 0 && (
          <>
            <p className={styles.sectionTitle}>Входы:</p>
            <ul className={styles.productList}>
              {step.inputProducts.map((p, i) => (
                <li key={i} className={styles.productItem}>
                  <span>{p.name}</span>
                  <span
                    className={
                      p.isExisting ? styles.badgeExisting : styles.badgeNew
                    }
                  >
                    {p.isExisting
                      ? `в дереве${p.existingNodeLabel ? `: ${p.existingNodeLabel}` : ""}`
                      : "новый"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {step.outputProducts.length > 0 && (
          <>
            <p className={styles.sectionTitle}>Выходы:</p>
            <ul className={styles.productList}>
              {step.outputProducts.map((p, i) => (
                <li key={i} className={styles.productItem}>
                  <span>{p.name}</span>
                  <span
                    className={
                      p.isExisting ? styles.badgeExisting : styles.badgeNew
                    }
                  >
                    {p.isExisting
                      ? `в дереве${p.existingNodeLabel ? `: ${p.existingNodeLabel}` : ""}`
                      : "новый"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.retryBtn} onClick={onRetry}>
            Повторить запрос
          </button>
          <button className={styles.cancelBtn} onClick={onReject}>
            Отменить
          </button>
          <button className={styles.acceptBtn} onClick={onAccept}>
            Добавить шаг
          </button>
        </div>
      </div>
    </div>
  );
};
