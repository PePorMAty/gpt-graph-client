import React from "react";
import type { FocusScope } from "../../utils/focusSubgraph";
import styles from "./FocusModeHud.module.css";

interface FocusModeHudProps {
  /** Метка текущего фокус-узла. */
  focusLabel: string;
  /** Метки пути навигации (от старых к новым), БЕЗ текущего фокуса. */
  historyLabels: string[];
  /** Охват окрестности: шаги / соседи / вся цепочка узла. */
  scope: FocusScope;
  onScopeChange: (scope: FocusScope) => void;
  /** Глубина окрестности в шагах-продуктах (для охвата «Шаги»). */
  depth: number;
  onDepthChange: (depth: number) => void;
  /** Шаг назад по истории. Недоступен при пустой истории. */
  onBack: () => void;
  /** Переход к произвольному элементу истории (индекс в historyLabels). */
  onJumpTo: (index: number) => void;
}

const DEPTH_OPTIONS = [1, 2, 3];
/** Сколько последних посещённых узлов показывать в крошках. */
const VISIBLE_CRUMBS = 3;

const SCOPE_OPTIONS: Array<{
  value: FocusScope;
  label: string;
  title: string;
}> = [
  {
    value: "steps",
    label: "Шаги",
    title: "Окрестность узла на 1–3 шага в обе стороны",
  },
  {
    value: "chain",
    label: "Цепочка",
    title:
      "Вся цепочка узла: все его предки и потомки целиком, без остального графа",
  },
  {
    value: "chain-up",
    label: "↑ Вверх",
    title:
      "Только вверх от узла: все входящие связи (предки) до конца",
  },
  {
    value: "chain-down",
    label: "↓ Вниз",
    title:
      "Только вниз от узла: все исходящие связи (потомки) до конца",
  },
];

/**
 * Плашка фокус-режима: путь навигации (хлебные крошки), кнопка «назад»,
 * выбор охвата и глубины окрестности. Поверх полотна. Выход из режима —
 * та же кнопка на боковой панели, которой в него вошли.
 */
export const FocusModeHud: React.FC<FocusModeHudProps> = ({
  focusLabel,
  historyLabels,
  scope,
  onScopeChange,
  depth,
  onDepthChange,
  onBack,
  onJumpTo,
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

      <div className={styles.scope}>
        {SCOPE_OPTIONS.map((opt) => (
          <React.Fragment key={opt.value}>
            <button
              type="button"
              className={`${styles.scopeButton} ${
                scope === opt.value ? styles.scopeButtonActive : ""
              }`}
              onClick={() => onScopeChange(opt.value)}
              title={opt.title}
              aria-pressed={scope === opt.value}
            >
              {opt.label}
            </button>
            {/* Глубина — только для охвата «Шаги», сразу за его кнопкой. */}
            {opt.value === "steps" &&
              scope === "steps" &&
              DEPTH_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.depthButton} ${
                    d === depth ? styles.depthButtonActive : ""
                  }`}
                  onClick={() => onDepthChange(d)}
                  title={`Видно ${d} шаг(а) вокруг фокуса`}
                  aria-pressed={d === depth}
                >
                  {d}
                </button>
              ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
