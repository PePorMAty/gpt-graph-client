import { useEffect, useMemo, useState, type FC } from "react";
import type { StepChainApiStep, StepProduct } from "../../store/types";
import { normalizeProductName } from "../../utils/normalizeProductName";
import { StepWizardSteps } from "./StepWizardSteps";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookIcon,
  CloseIcon,
  FlaskIcon,
  GearIcon,
  PlusIcon,
} from "../icons";
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
  /**
   * Направление шага. Определяет, чем является добавленный вручную продукт:
   * при построении вниз новые продукты — выходы преобразования, при
   * построении вверх — входы (сырьё). Выбора стороны в форме нет: шаг
   * однонаправленный, и сторону задаёт именно направление.
   */
  direction: "up" | "down";
  /**
   * Рисовать внутри окна построения, а не отдельной модалкой поверх него.
   *
   * Превью — третий экран мастера, и своя затемнённая подложка с собственной
   * шапкой давала два окна с одним заголовком друг на друге. Снаружи остаётся
   * одно окно: заголовок и полосу шагов даёт оно.
   */
  inline?: boolean;
  onAccept: (filteredStep: StepChainApiStep) => void;
  onRetry: () => void;
  onReject: () => void;
}

export const StepPreviewModal: FC<StepPreviewModalProps> = ({
  step,
  anchorProductName,
  stepNumber,
  direction,
  inline = false,
  onAccept,
  onRetry,
  onReject,
}) => {
  // Куда попадёт свой продукт: вниз строим — он выход, вверх — вход (сырьё).
  const customSide: "input" | "output" =
    direction === "up" ? "input" : "output";
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
  const [customProducts, setCustomProducts] = useState<StepProduct[]>([]);
  const [formOpen, setFormOpen] = useState(false);
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
      customProducts.some((p) => normalizeProductName(p.name) === norm);
    if (clash) {
      setFormError("Такой продукт уже есть в шаге");
      return;
    }
    setCustomProducts((prev) => [
      ...prev,
      {
        name,
        description: formDescription.trim() || undefined,
        isExisting: false,
        isUserAdded: true,
      },
    ]);
    setFormName("");
    setFormDescription("");
    setFormError(null);
  };

  const removeCustomProduct = (index: number) => {
    setCustomProducts((prev) => prev.filter((_, i) => i !== index));
  };

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
        ...(customSide === "input" ? customProducts : []),
      ],
      outputProducts: [
        ...step.outputProducts.filter((_, i) => !excludedOutputs.has(i)),
        ...(customSide === "output" ? customProducts : []),
      ],
    };
    onAccept(filteredStep);
  };

  /** Список продуктов одной стороны — вид у входов и выходов один. */
  const productList = (
    items: { product: StepProduct; origIdx: number }[],
    excluded: Set<number>,
    toggle: (i: number) => void,
    side: "input" | "output",
  ) => (
    <ul className={styles.productList}>
      {items.map(({ product: p, origIdx }) => (
        <li key={origIdx} className={styles.productItem}>
          <input
            type="checkbox"
            className={styles.productCheck}
            checked={!excluded.has(origIdx)}
            onChange={() => toggle(origIdx)}
            title="Включить продукт в шаг"
          />
          <span className={styles.productIcon}>
            <FlaskIcon size={17} />
          </span>
          <span className={styles.productName}>{p.name}</span>
          <span className={p.isExisting ? styles.badgeExisting : styles.badgeNew}>
            {p.isExisting
              ? `в графе${p.existingNodeLabel ? `: ${p.existingNodeLabel}` : ""}`
              : "новый"}
          </span>
        </li>
      ))}
      {customSide === side &&
        customProducts.map((p, i) => (
          <CustomProductItem
            key={`custom-${side}-${i}`}
            product={p}
            onRemove={() => removeCustomProduct(i)}
          />
        ))}
    </ul>
  );

  const notes = step.transformation.notes ?? [];
  const showInputs =
    visibleInputs.length > 0 ||
    (customSide === "input" && customProducts.length > 0);
  const showOutputs =
    visibleOutputs.length > 0 ||
    (customSide === "output" && customProducts.length > 0);

  const body = (
    <>
        {/* Сам шаг: что за процесс получился. */}
        <section className={styles.card}>
          <span className={styles.cardIcon}>
            <GearIcon size={24} />
          </span>
          <div className={styles.cardText}>
            <span className={styles.cardCap}>
              Производственный шаг #{stepNumber}
            </span>
            <div className={styles.cardName}>{step.transformation.name}</div>
            {step.transformation.description && (
              <p className={styles.cardDesc}>
                {step.transformation.description}
              </p>
            )}
          </div>
        </section>

        {showInputs && (
          <section className={styles.block}>
            <span className={styles.blockIcon}>
              <ArrowDownIcon size={18} />
            </span>
            <div className={styles.blockBody}>
              <span className={styles.blockTitle}>
                Входные данные ({visibleInputs.length +
                  (customSide === "input" ? customProducts.length : 0)})
              </span>
              {productList(visibleInputs, excludedInputs, toggleInput, "input")}
            </div>
          </section>
        )}

        {showOutputs && (
          <section className={styles.block}>
            <span className={styles.blockIcon}>
              <ArrowUpIcon size={18} />
            </span>
            <div className={styles.blockBody}>
              <span className={styles.blockTitle}>
                Выходные данные ({visibleOutputs.length +
                  (customSide === "output" ? customProducts.length : 0)})
              </span>
              {productList(
                visibleOutputs,
                excludedOutputs,
                toggleOutput,
                "output",
              )}
            </div>
          </section>
        )}

        {/* Оговорки к шагу. Блока нет вовсе, когда сказать нечего: пустых
            «Примечаний» быть не должно — они читались бы как потерянный текст. */}
        {notes.length > 0 && (
          <section className={styles.block}>
            <span className={styles.blockIcon}>
              <BookIcon size={18} />
            </span>
            <div className={styles.blockBody}>
              <span className={styles.blockTitle}>Примечания</span>
              <ul className={styles.notes}>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </section>
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
              <span className={styles.customPlus}>
                <PlusIcon size={15} />
              </span>
              Добавить свой продукт
            </button>
          ) : (
            <div className={styles.customForm}>
              {/* Сторону не выбираем: шаг строится в одну сторону, и продукт
                  встаёт туда же, куда идёт построение. */}
              <div className={styles.customSideRow}>
                Продукт добавится
                {customSide === "input"
                  ? " во входы (построение вверх — сырьё)"
                  : " в выходы (построение вниз — продукт)"}
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
          <button type="button" className={styles.cancelBtn} onClick={onReject}>
            Назад к обобщению
          </button>
          <span className={styles.actionsRight}>
            <button type="button" className={styles.retryBtn} onClick={onRetry}>
              Повторить запрос
            </button>
            <button
              type="button"
              className={styles.acceptBtn}
              onClick={handleAccept}
            >
              <PlusIcon size={17} />
              Добавить шаг
            </button>
          </span>
        </div>
    </>
  );

  if (inline) return <div className={styles.inline}>{body}</div>;

  return (
    <div className={styles.overlay} onClick={onReject}>
      <div
        className={styles.window}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className={styles.head}>
          <h3 className={styles.title}>Построение — «{anchorProductName}»</h3>
          <button
            type="button"
            className={styles.closeX}
            onClick={onReject}
            aria-label="Закрыть"
          >
            <CloseIcon size={20} />
          </button>
        </header>

        <StepWizardSteps current={4} />
        {body}
      </div>
    </div>
  );
};
