import React from "react";
import styles from "./FocusModeHud.module.css";

interface FocusModeHudProps {
  /** Метка текущего фокус-узла. */
  focusLabel: string;
  /** Метки пути навигации (от старых к новым), БЕЗ текущего фокуса. */
  historyLabels: string[];
  /** Глубина видимой окрестности (в шагах-продуктах). */
  depth: number;
  onDepthChange: (depth: number) => void;
  /** Шаг назад по истории. Недоступен при пустой истории. */
  onBack: () => void;
  /** Переход к произвольному элементу истории (индекс в historyLabels). */
  onJumpTo: (index: number) => void;
  onExit: () => void;
}

const DEPTH_OPTIONS = [1, 2, 3];
/** Сколько последних посещённых узлов показывать в крошках. */
const VISIBLE_CRUMBS = 3;

/**
 * Плашка фокус-режима: путь навигации (хлебные крошки), кнопка «назад»,
 * выбор глубины окрестности и выход из режима. Рисуется поверх полотна.
 */
export const FocusModeHud: React.FC<FocusModeHudProps> = ({
  focusLabel,
  historyLabels,
  depth,
  onDepthChange,
  onBack,
  onJumpTo,
  onExit,
}) => {
  const hiddenCount = Math.max(0, historyLabels.length - VISIBLE_CRUMBS);
  const visibleCrumbs = historyLabels.slice(-VISIBLE_CRUMBS);

  return (
    <div className={styles.hud}>
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
        disabled={historyLabels.length === 0}
        title="Шаг назад по истории"
        aria-label="Шаг назад по истории"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Назад
      </button>

      <div className={styles.crumbs}>
        {hiddenCount > 0 && (
          <span className={styles.crumbEllipsis} title={`Ещё ${hiddenCount} шаг(ов) истории`}>
            …
          </span>
        )}
        {visibleCrumbs.map((label, i) => {
          const realIndex = hiddenCount + i;
          return (
            <React.Fragment key={`${realIndex}-${label}`}>
              <button
                type="button"
                className={styles.crumb}
                onClick={() => onJumpTo(realIndex)}
                title={`Вернуться к «${label}»`}
              >
                {label}
              </button>
              <span className={styles.crumbSep}>›</span>
            </React.Fragment>
          );
        })}
        <span className={styles.crumbCurrent} title={focusLabel}>
          {focusLabel}
        </span>
      </div>

      <div className={styles.depth} title="Сколько шагов видно вокруг фокуса">
        <span className={styles.depthLabel}>Шаги:</span>
        {DEPTH_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.depthButton} ${
              d === depth ? styles.depthButtonActive : ""
            }`}
            onClick={() => onDepthChange(d)}
            aria-pressed={d === depth}
          >
            {d}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={styles.exitButton}
        onClick={onExit}
        title="Выйти из фокус-режима"
        aria-label="Выйти из фокус-режима"
      >
        ✕
      </button>
    </div>
  );
};
