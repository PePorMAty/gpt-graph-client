import { useEffect, useMemo, useState, type FC } from "react";
import type { StepChainApiStep } from "../../store/types";
import { normalizeProductName } from "../../utils/normalizeProductName";
import styles from "./StepPreviewModal.module.css";

interface StepPreviewModalProps {
  step: StepChainApiStep;
  anchorProductName: string;
  stepNumber: number;
  onAccept: (filteredStep: StepChainApiStep) => void;
  onRetry: () => void;
  onReject: () => void;
}

export const StepPreviewModal: FC<StepPreviewModalProps> = ({
  step,
  anchorProductName,
  stepNumber,
  onAccept,
  onRetry,
  onReject,
}) => {
  const anchorNorm = useMemo(
    () => normalizeProductName(anchorProductName),
    [anchorProductName],
  );

  const visibleInputs = useMemo(
    () =>
      step.inputProducts
        .map((p, idx) => ({ product: p, origIdx: idx }))
        .filter(({ product }) => normalizeProductName(product.name) !== anchorNorm),
    [step.inputProducts, anchorNorm],
  );
  const visibleOutputs = useMemo(
    () =>
      step.outputProducts
        .map((p, idx) => ({ product: p, origIdx: idx }))
        .filter(({ product }) => normalizeProductName(product.name) !== anchorNorm),
    [step.outputProducts, anchorNorm],
  );

  const [excludedInputs, setExcludedInputs] = useState<Set<number>>(new Set());
  const [excludedOutputs, setExcludedOutputs] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onReject();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onReject]);

  const toggleInput = (origIdx: number) => {
    setExcludedInputs((prev) => {
      const next = new Set(prev);
      if (next.has(origIdx)) next.delete(origIdx);
      else next.add(origIdx);
      return next;
    });
  };

  const toggleOutput = (origIdx: number) => {
    setExcludedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(origIdx)) next.delete(origIdx);
      else next.add(origIdx);
      return next;
    });
  };

  const handleAccept = () => {
    const filteredStep: StepChainApiStep = {
      ...step,
      inputProducts: step.inputProducts.filter(
        (_, i) => !excludedInputs.has(i),
      ),
      outputProducts: step.outputProducts.filter(
        (_, i) => !excludedOutputs.has(i),
      ),
    };
    onAccept(filteredStep);
  };

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

        {visibleInputs.length > 0 && (
          <>
            <p className={styles.sectionTitle}>Входы:</p>
            <ul className={styles.productList}>
              {visibleInputs.map(({ product: p, origIdx }) => (
                <li key={origIdx} className={styles.productItem}>
                  <label className={styles.productCheckbox}>
                    <input
                      type="checkbox"
                      checked={!excludedInputs.has(origIdx)}
                      onChange={() => toggleInput(origIdx)}
                    />
                    <span>{p.name}</span>
                  </label>
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

        {visibleOutputs.length > 0 && (
          <>
            <p className={styles.sectionTitle}>Выходы:</p>
            <ul className={styles.productList}>
              {visibleOutputs.map(({ product: p, origIdx }) => (
                <li key={origIdx} className={styles.productItem}>
                  <label className={styles.productCheckbox}>
                    <input
                      type="checkbox"
                      checked={!excludedOutputs.has(origIdx)}
                      onChange={() => toggleOutput(origIdx)}
                    />
                    <span>{p.name}</span>
                  </label>
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
          <button className={styles.acceptBtn} onClick={handleAccept}>
            Добавить шаг
          </button>
        </div>
      </div>
    </div>
  );
};
