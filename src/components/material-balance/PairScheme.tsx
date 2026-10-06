import type { FC } from "react";

import {
  DIRECTION_ARROW,
  formatMass,
  formatView,
  shownMass,
  type BalanceDirection,
  type BalanceView,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { BasisFields } from "./BasisFields";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

interface Props {
  transformation: CustomNode;
  ins: CustomNode[];
  outs: CustomNode[];
  input: CustomNode | undefined;
  output: CustomNode | undefined;
  direction: BalanceDirection;
  /** Количество базисного продукта: расчёта, если он открыт, иначе формы. */
  view: BalanceView;
  onView: (view: BalanceView) => void;
  /** Открытый расчёт — тогда у второго продукта его масса. */
  calc?: MaterialBalanceCalc;
  onPair: (pair: { inputId?: string; outputId?: string }) => void;
  disabled?: boolean;
}

/**
 * Пара расчёта как на полотне: сырьё сверху, продукт снизу, между ними
 * преобразование и стрелка направления. Количество — у базисного продукта
 * («вниз» — у сырья, «вверх» — у продукта), у второго — что посчитала
 * модель. Под схемой — вопрос к модели обычными словами.
 */
export const PairScheme: FC<Props> = ({
  transformation,
  ins,
  outs,
  input,
  output,
  direction,
  view,
  onView,
  calc,
  onPair,
  disabled,
}) => {
  const down = direction === "down";

  const row = (kind: "input" | "output") => {
    const isInput = kind === "input";
    const list = isInput ? ins : outs;
    const node = isInput ? input : output;
    const basis = isInput === down;
    const ref = isInput ? "P1" : "P2";
    const aria = isInput ? "Сырьё" : "Продукт";
    return (
      <div className={`${styles.schemeRow} ${basis ? styles.schemeBasis : ""}`}>
        <div className={styles.schemeHead}>
          <span className={styles.schemeRole}>{aria}</span>
          {basis && <span className={styles.schemeTag}>базис</span>}
        </div>
        {list.length > 1 ? (
          <select
            className={styles.select}
            value={node?.id ?? ""}
            onChange={(e) =>
              onPair(isInput ? { inputId: e.target.value } : { outputId: e.target.value })
            }
            aria-label={aria}
            disabled={disabled}
          >
            {list.map((n) => (
              <option key={n.id} value={n.id}>
                {label(n)}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.pairName}>{label(list[0])}</span>
        )}
        <div className={styles.schemeAmount}>
          {basis ? (
            <BasisFields view={view} onChange={onView} disabled={disabled} />
          ) : calc ? (
            <span className={styles.schemeResult}>
              {down ? "получится " : "нужно "}
              <b>{formatMass(shownMass(calc, ref), calc.view.unit)}</b>
            </span>
          ) : (
            <span className={styles.muted}>
              {down ? "сколько получится" : "сколько нужно"} — посчитает модель
            </span>
          )}
        </div>
      </div>
    );
  };

  const amount = formatView(view);
  const question = down
    ? `Сколько «${label(output)}» получится из ${amount} «${label(input)}»?`
    : `Сколько «${label(input)}» нужно на ${amount} «${label(output)}»?`;

  return (
    <div className={styles.scheme}>
      {row("input")}
      <div className={styles.schemeArrow}>
        <span className={styles.schemeArrowIcon} aria-hidden>
          {DIRECTION_ARROW[direction]}
        </span>
        «{label(transformation)}»
      </div>
      {row("output")}
      <p className={styles.question}>{question}</p>
    </div>
  );
};
