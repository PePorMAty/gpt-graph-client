import { useEffect, useState, type FC } from "react";

import {
  BALANCE_UNITS,
  type BalanceUnit,
  type BalanceView,
} from "../../utils/materialBalance";
import styles from "./MaterialBalance.module.css";

/** Количество из поля: «1,5» и «1.5» — одно и то же; не число — null. */
function parseAmount(text: string): number | null {
  const v = Number(String(text).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}

interface Props {
  view: BalanceView;
  onChange: (view: BalanceView) => void;
  disabled?: boolean;
}

/**
 * Количество сырья пары: число и единица. Числа на узлах и во
 * вкладке пересчитываются сразу — модель для этого не нужна. Единица меняет
 * смысл числа: «1 т» → «1 кг», а не переводит его в «1000 кг».
 *
 * Количество держим строкой: иначе «1,» на полпути к «1,5» превращалось бы
 * в «1», и дробное число было бы не вписать.
 */
export const BasisFields: FC<Props> = ({ view, onChange, disabled }) => {
  const [text, setText] = useState(() => String(view.amount).replace(".", ","));
  useEffect(() => {
    // Количество сменилось снаружи (другой расчёт) — показать его число.
    if (parseAmount(text) !== view.amount) setText(String(view.amount).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.amount]);

  const bad = parseAmount(text) === null;
  return (
    <span className={styles.basisFields}>
      <input
        className={`${styles.amount} ${bad ? styles.amountBad : ""}`}
        value={text}
        inputMode="decimal"
        aria-label="Количество"
        aria-invalid={bad}
        title={bad ? "Нужно положительное число" : undefined}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const amount = parseAmount(e.target.value);
          if (amount !== null) onChange({ ...view, amount });
        }}
      />
      <select
        className={styles.select}
        value={view.unit}
        aria-label="Единица"
        disabled={disabled}
        onChange={(e) => onChange({ ...view, unit: e.target.value as BalanceUnit })}
      >
        {BALANCE_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </span>
  );
};
