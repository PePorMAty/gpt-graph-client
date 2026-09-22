import type { FC } from "react";

import styles from "./StepWizard.module.css";

/** Шаги мастера построения — по порядку прохождения. */
const WIZARD_STEPS = [
  { n: 1, label: "Построение" },
  { n: 2, label: "Источники" },
  { n: 3, label: "Обобщение" },
  { n: 4, label: "Превью" },
] as const;

export type WizardStep = 1 | 2 | 3 | 4;

interface Props {
  current: WizardStep;
  /**
   * Самый дальний шаг, до которого уже дошли.
   *
   * Отличается от current, когда человек вернулся назад посмотреть: обобщение
   * получено, но открыты источники. Тогда вперёд идти ЕСТЬ куда, и запрещать
   * это было бы неправдой — пришлось бы обобщать заново ради того, что уже
   * есть. По умолчанию совпадает с current: дальше него не ходили.
   */
  reached?: WizardStep;
  /** Перейти на доступный шаг. Без него номера просто показывают, где мы. */
  onGoTo?: (step: WizardStep) => void;
}

/**
 * Полоса «1 Построение — 2 Источники — 3 Обобщение — 4 Превью».
 *
 * Показывает не выбор, а положение. Перескочить дальше пройденного нельзя —
 * источников ещё нет, обобщать нечего; такие шаги остаются бледными, чтобы по
 * ним не тыкали впустую. А вот вернуться назад и снова уйти вперёд можно
 * свободно: то, что уже получено, никуда не делось.
 */
export const StepWizardSteps: FC<Props> = ({ current, reached, onGoTo }) => {
  const far = Math.max(reached ?? current, current);
  return (
  <ol className={styles.steps} aria-label="Шаги построения">
    {WIZARD_STEPS.map(({ n, label }, i) => {
      const state = n === current ? "on" : n < current ? "done" : "next";
      const canGo = Boolean(onGoTo) && n !== current && n <= far;
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
};
