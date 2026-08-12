import { useEffect, useMemo, useState, type FC } from "react";
import type { StepChainApiStep, StepProduct } from "../../store/types";
import { normalizeProductName } from "../../utils/normalizeProductName";
import styles from "./StepPreviewModal.module.css";

/**
 * Строка продукта, добавленного вручную. Вместо чекбокса — удаление: свой
 * продукт либо есть в шаге, либо его убирают совсем. Бейдж показывает, что
 * описание не заполнено, — таким же он будет и на узле графа.
 */
const CustomProductItem: FC<{
  product: StepProduct;
  onRemove: () => void;
}> = ({ product, onRemove }) => (
  <li className={styles.productItem}>
    <span className={styles.customName} title={product.description || undefined}>
      {product.name}
    </span>
    <span
      className={
        product.description ? styles.badgeCustom : styles.badgeUnfilled
      }
    >
      {product.description ? "свой" : "свой, не заполнен"}
    </span>
    <button
      type="button"
      className={styles.customRemove}
      onClick={onRemove}
      title="Убрать продукт"
      aria-label={`Убрать «${product.name}»`}
    >
      ✕
    </button>
  </li>
);

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

  // Продукты, добавленные пользователем вручную (модель их не предлагала).
  const [customProducts, setCustomProducts] = useState<
    Array<{ side: "input" | "output"; product: StepProduct }>
  >([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formSide, setFormSide] = useState<"input" | "output">("output");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addCustomProduct = () => {
    const name = formName.trim();
    if (!name) {
      setFormError("Введите название продукта");
      return;
    }
    const norm = normalizeProductName(name);
    if (norm === anchorNorm) {
      setFormError("Это продукт, от которого строится шаг");
      return;
    }
    const clash =
      step.inputProducts.some((p) => normalizeProductName(p.name) === norm) ||
      step.outputProducts.some((p) => normalizeProductName(p.name) === norm) ||
      customProducts.some(
        (c) => normalizeProductName(c.product.name) === norm,
      );
    if (clash) {
      setFormError("Такой продукт уже есть в шаге");
      return;
    }
    setCustomProducts((prev) => [
      ...prev,
      {
        side: formSide,
        product: {
          name,
          description: formDescription.trim() || undefined,
          isExisting: false,
          isUserAdded: true,
        },
      },
    ]);
    setFormName("");
    setFormDescription("");
    setFormError(null);
  };

  const removeCustomProduct = (index: number) => {
    setCustomProducts((prev) => prev.filter((_, i) => i !== index));
  };

  /** Свои продукты одной стороны + их индексы в общем списке (для удаления). */
  const customBySide = (side: "input" | "output") =>
    customProducts
      .map((c, index) => ({ ...c, index }))
      .filter((c) => c.side === side);

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
      inputProducts: [
        ...step.inputProducts.filter((_, i) => !excludedInputs.has(i)),
        ...customBySide("input").map((c) => c.product),
      ],
      outputProducts: [
        ...step.outputProducts.filter((_, i) => !excludedOutputs.has(i)),
        ...customBySide("output").map((c) => c.product),
      ],
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

        {(visibleInputs.length > 0 || customBySide("input").length > 0) && (
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
              {customBySide("input").map((c) => (
                <CustomProductItem
                  key={`custom-in-${c.index}`}
                  product={c.product}
                  onRemove={() => removeCustomProduct(c.index)}
                />
              ))}
            </ul>
          </>
        )}

        {(visibleOutputs.length > 0 || customBySide("output").length > 0) && (
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
              {customBySide("output").map((c) => (
                <CustomProductItem
                  key={`custom-out-${c.index}`}
                  product={c.product}
                  onRemove={() => removeCustomProduct(c.index)}
                />
              ))}
            </ul>
          </>
        )}

        {/* ── Свой продукт: модель могла не предложить нужный, добавляем руками.
            Описание необязательно — без него узел встанет как «не заполнен»
            и его можно дописать позже в карточке. ── */}
        <div className={styles.customBox}>
          {!formOpen ? (
            <button
              type="button"
              className={styles.customToggle}
              onClick={() => setFormOpen(true)}
            >
              ＋ Добавить свой продукт
            </button>
          ) : (
            <div className={styles.customForm}>
              <div className={styles.customSideRow}>
                <span className={styles.customSideLabel}>Куда:</span>
                <label className={styles.customRadio}>
                  <input
                    type="radio"
                    checked={formSide === "input"}
                    onChange={() => setFormSide("input")}
                  />
                  во входы
                </label>
                <label className={styles.customRadio}>
                  <input
                    type="radio"
                    checked={formSide === "output"}
                    onChange={() => setFormSide("output")}
                  />
                  в выходы
                </label>
              </div>
              <input
                type="text"
                className={styles.customInput}
                placeholder="Название продукта"
                value={formName}
                autoFocus
                onChange={(e) => {
                  setFormName(e.target.value);
                  setFormError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomProduct();
                }}
              />
              <textarea
                className={styles.customTextarea}
                placeholder="Описание (необязательно — можно заполнить позже)"
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
              {formError && (
                <div className={styles.customError}>{formError}</div>
              )}
              <div className={styles.customFormActions}>
                <button
                  type="button"
                  className={styles.customCancel}
                  onClick={() => {
                    setFormOpen(false);
                    setFormName("");
                    setFormDescription("");
                    setFormError(null);
                  }}
                >
                  Скрыть
                </button>
                <button
                  type="button"
                  className={styles.customAdd}
                  onClick={addCustomProduct}
                >
                  Добавить
                </button>
              </div>
            </div>
          )}
        </div>

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
