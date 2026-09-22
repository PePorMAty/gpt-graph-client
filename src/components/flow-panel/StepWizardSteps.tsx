import type { FC } from "react";

import styles from "./StepWizard.module.css";

/** Шаги мастера построения — по порядку прохождения. */
const WIZARD_STEPS = [
  { n: 1, label: "Построение" },
  { n: 2, label: "Источники" },
  { n: 3, label: "Превью" },
] as const;

export type WizardStep = 1 | 2 | 3;

interface Props {
  current: WizardStep;
  /** Вернуться на пройденный шаг. Без него номера просто показывают, где мы. */
  onGoTo?: (step: WizardStep) => void;
}

/**
 * Полоса «1 Построение — 2 Источники — 3 Превью».
 *
 * Показывает не выбор, а положение: шаги идут строго по порядку, перескочить
 * вперёд нельзя — источников ещё нет, обобщать нечего. Назад можно, и только
 * назад кликабельно; будущие шаги остаются бледными, чтобы по ним не тыкали
 * впустую.
 */
export const StepWizardSteps: FC<Props> = ({ current, onGoTo }) => (
  <ol className={styles.steps} aria-label="Шаги построения">
    {WIZARD_STEPS.map(({ n, label }, i) => {
      const state = n === current ? "on" : n < current ? "done" : "next";
      const canGo = Boolean(onGoTo) && n < current;
      return (
        <li key={n} className={styles.stepItem}>
          {i > 0 && (
            <span
              className={`${styles.stepLine} ${
                n <= current ? styles.stepLineDone : ""
              }`}
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            className={`${styles.step} ${styles[`step_${state}`]}`}
            onClick={canGo ? () => onGoTo?.(n as WizardStep) : undefined}
            disabled={!canGo}
            aria-current={n === current ? "step" : undefined}
          >
            <span className={styles.stepNum}>{n}</span>
            <span className={styles.stepLabel}>{label}</span>
          </button>
        </li>
      );
    })}
  </ol>
);
