import { useEffect, useState, type FC } from "react";

import { AiModelSelect } from "../ai-model-select";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  FlaskIcon,
  PencilIcon,
} from "../icons";
import styles from "./TransformationBetweenModal.module.css";

/** Продукт в списке: показываем имя, узел нужен только для ключа. */
export interface ModalProduct {
  nodeId: string;
  label: string;
}

export type ChainDirection = "down" | "up";

interface Props {
  /** Откуда берётся преобразование. */
  sources: ModalProduct[];
  /** Куда оно ведёт. */
  targets: ModalProduct[];
  direction: ChainDirection;
  onChangeDirection: (d: ChainDirection) => void;
  /** Есть ли у продукта соседи в каждую сторону — иначе выбор не предлагаем. */
  canGoDown: boolean;
  canGoUp: boolean;

  loading: boolean;
  error: string | null;

  defaultSystemPrompt: string;
  customSystemPrompt: string;
  isPromptDirty: boolean;
  onChangeCustomSystemPrompt: (value: string) => void;
  onResetSystemPrompt: () => void;

  onConfirm: () => void;
  onClose: () => void;
}

/**
 * «Получение преобразования между продуктами».
 *
 * Продукты здесь НЕ выбираются: они уже определены — это тот продукт, с
 * которого пришли, и его прямые соседи по графу. Поэтому ни выпадающих
 * списков, ни крестиков очистки: список просто растёт вниз, когда соседей
 * несколько. Выбор остаётся один — в какую сторону по цепочке смотреть, и от
 * него зависит, кто из двух сторон исходный, а кто целевой.
 *
 * Закрыть можно не дожидаясь ответа: запрос идёт минутами, держать человека в
 * модалке незачем. Он продолжается в фоне, результат ложится на полотно сам, о
 * готовности скажет уведомление. Поэтому «Отмена» во время запроса называется
 * «Свернуть» — ничего не отменяется, и обещать этого нельзя.
 */
export const TransformationBetweenModal: FC<Props> = ({
  sources,
  targets,
  direction,
  onChangeDirection,
  canGoDown,
  canGoUp,
  loading,
  error,
  defaultSystemPrompt,
  customSystemPrompt,
  isPromptDirty,
  onChangeCustomSystemPrompt,
  onResetSystemPrompt,
  onConfirm,
  onClose,
}) => {
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isEmpty = sources.length === 0 || targets.length === 0;
  const displayedPrompt = customSystemPrompt || defaultSystemPrompt;

  const productList = (items: ModalProduct[]) => (
    <ul className={styles.products}>
      {items.map((p) => (
        <li key={p.nodeId} className={styles.product}>
          <span className={styles.productIcon}>
            <FlaskIcon size={17} />
          </span>
          <span className={styles.productLabel}>{p.label || p.nodeId}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.window}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Получение преобразования между продуктами"
      >
        <header className={styles.head}>
          <span className={styles.headIcon}>
            <BranchIcon size={22} />
          </span>
          <div className={styles.headText}>
            <h3 className={styles.title}>
              Получение преобразования между продуктами
            </h3>
            <p className={styles.subtitle}>
              {targets.length > 1 || sources.length > 1
                ? "Преобразования будут найдены одним запросом."
                : "Преобразование будет найдено одним запросом."}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeX}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>

        {isEmpty ? (
          <div className={styles.empty}>
            {direction === "down"
              ? "У этого продукта нет прямых продуктов-потомков — преобразование строить не между чем."
              : "У этого продукта нет прямых продуктов-предков — преобразование строить не между чем."}
          </div>
        ) : (
          <div className={styles.pair}>
            <div className={styles.side}>
              <span className={styles.sideTitle}>
                {sources.length > 1 ? "Исходные продукты" : "Исходный продукт"}
              </span>
              {productList(sources)}
            </div>

            <span className={styles.pairArrow} aria-hidden="true">
              <ArrowDownIcon size={18} />
            </span>

            <div className={styles.side}>
              {/* Прилагательное склоняется вместе с существительным: «Целевой
                  продукты» — не по-русски, а приписать одну букву «ы» к концу
                  строки мало. */}
              <span className={styles.sideTitle}>
                {targets.length > 1 ? "Целевые продукты" : "Целевой продукт"}
              </span>
              {productList(targets)}
            </div>
          </div>
        )}

        <div className={styles.directions}>
          <span className={styles.sideTitle}>
            Направление по цепочке
            <span
              className={styles.hint}
              title="Вниз — что получается из этого продукта. Вверх — из чего он сам производится."
            >
              ?
            </span>
          </span>
          <div className={styles.directionRow}>
            {(
              [
                ["down", "Вниз по цепочке", canGoDown, <ArrowDownIcon size={17} />],
                ["up", "Вверх по цепочке", canGoUp, <ArrowUpIcon size={17} />],
              ] as const
            ).map(([value, label, enabled, icon]) => (
              <button
                key={value}
                type="button"
                className={`${styles.direction} ${
                  direction === value ? styles.directionOn : ""
                }`}
                onClick={() => onChangeDirection(value)}
                // Сторону без соседей не запрещаем молча: кнопка остаётся
                // видимой и говорит, почему по ней нечего искать.
                disabled={loading || !enabled}
                title={enabled ? undefined : "В эту сторону соседних продуктов нет"}
              >
                <span className={styles.directionIcon}>{icon}</span>
                {label}
                <span
                  className={`${styles.radio} ${
                    direction === value ? styles.radioOn : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.promptBlock}>
          <button
            type="button"
            className={styles.promptToggle}
            onClick={() => setIsPromptOpen((v) => !v)}
            disabled={loading}
          >
            <PencilIcon size={15} />
            Редактировать промпт{isPromptDirty ? " (изменён)" : ""}
          </button>
          {isPromptOpen && (
            <>
              <AiModelSelect />
              <textarea
                className={styles.promptTextarea}
                value={displayedPrompt}
                onChange={(e) => onChangeCustomSystemPrompt(e.target.value)}
                disabled={loading}
                rows={10}
                spellCheck={false}
              />
              <button
                type="button"
                className={styles.promptReset}
                onClick={onResetSystemPrompt}
                disabled={loading || !isPromptDirty}
              >
                Сбросить к исходному
              </button>
            </>
          )}
        </div>

        {loading && (
          <div className={styles.running} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>
              Идёт запрос. Можно свернуть — преобразование появится на полотне
              само, о готовности скажет уведомление.
            </span>
          </div>
        )}

        {error && !loading && <div className={styles.error}>Ошибка: {error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {loading ? "Свернуть" : "Отмена"}
          </button>
          <button
            type="button"
            className={`${styles.primary} ${loading ? styles.primaryBusy : ""}`}
            onClick={onConfirm}
            disabled={loading || isEmpty}
          >
            {loading ? (
              <>
                <span className={styles.spinnerOnBrand} aria-hidden="true" />
                Запрос идёт…
              </>
            ) : (
              <>
                {error ? "Повторить" : "Получить преобразование"}
                <ArrowDownIcon size={17} className={styles.primaryArrow} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
