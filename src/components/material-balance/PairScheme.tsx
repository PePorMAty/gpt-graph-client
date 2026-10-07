import type { FC } from "react";

import {
  formatMass,
  formatPercent,
  formatView,
  pairYield,
  shownMass,
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
  /** Количество сырья: расчёта, если он открыт, иначе формы. */
  view: BalanceView;
  onView: (view: BalanceView) => void;
  /** Открытый расчёт — тогда у продукта его масса. */
  calc?: MaterialBalanceCalc;
  onPair: (pair: { inputId?: string; outputId?: string }) => void;
  disabled?: boolean;
}

/**
 * Пара расчёта как на полотне: сырьё сверху, продукт снизу, между ними
 * преобразование. У сырья — количество, у продукта — сколько его получится
 * по расчёту модели. Под схемой — вопрос к модели обычными словами.
 */
export const PairScheme: FC<Props> = ({
  transformation,
  ins,
  outs,
  input,
  output,
  view,
  onView,
  calc,
  onPair,
  disabled,
}) => {
  // Выход — доля массы сырья, ставшая продуктом: от количества не зависит.
  const share = calc ? pairYield(calc.record) : null;
  const row = (kind: "input" | "output") => {
    const isInput = kind === "input";
    const list = isInput ? ins : outs;
    const node = isInput ? input : output;
    const aria = isInput ? "Сырьё" : "Продукт";
    return (
      <div className={`${styles.schemeRow} ${isInput ? styles.schemeBasis : ""}`}>
        <div className={styles.schemeHead}>
          <span className={styles.schemeRole}>{aria}</span>
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
          {isInput ? (
            <BasisFields view={view} onChange={onView} disabled={disabled} />
          ) : calc ? (
            <span className={styles.schemeResult}>
              получится <b>{formatMass(shownMass(calc, "P2"), calc.view.unit)}</b>
              {share && <> · выход {formatPercent(share)}</>}
            </span>
          ) : (
            <span className={styles.muted}>сколько получится — посчитает модель</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.scheme}>
      {row("input")}
      <div className={styles.schemeArrow}>
        <span className={styles.schemeArrowIcon} aria-hidden>
          ↓
        </span>
        «{label(transformation)}»
      </div>
      {row("output")}
      <p className={styles.question}>
        Сколько «{label(output)}» получится из {formatView(view)} «{label(input)}»?
      </p>
    </div>
  );
};
