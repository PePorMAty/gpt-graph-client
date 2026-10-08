import { useEffect, useState, type FC } from "react";

import {
  BALANCE_UNITS,
  type BalanceInputAmount,
  type BalanceUnit,
} from "../../utils/materialBalance";
import styles from "./MaterialBalance.module.css";

/** Количество из поля: «1,5» и «1.5» — одно и то же; не число — undefined, пусто — null. */
function parseAmount(text: string): number | null | undefined {
  const t = String(text).replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

interface Props {
  value: BalanceInputAmount;
  onChange: (value: BalanceInputAmount) => void;
  /** Подпись поля для экранного диктора: название сырья. */
  label: string;
  disabled?: boolean;
}

/**
 * Количество одного сырья: число и единица. Пустое поле — «сколько нужно»:
 * сколько этого сырья потребуется, посчитает расчёт. Числа на узлах и во
 * вкладке пересчитываются сразу — модель для этого не нужна. Единица меняет
 * смысл числа: «1 т» → «1 кг», а не переводит его в «1000 кг».
 *
 * Количество держим строкой: иначе «1,» на полпути к «1,5» превращалось бы
 * в «1», и дробное число было бы не вписать.
 */
export const BasisFields: FC<Props> = ({ value, onChange, label, disabled }) => {
  const [text, setText] = useState(() => show(value.amount));
  useEffect(() => {
    // Количество сменилось снаружи (другой расчёт) — показать его число.
    if (parseAmount(text) !== value.amount) setText(show(value.amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.amount]);

  const parsed = parseAmount(text);
  const bad = parsed === undefined;
  return (
    <span className={styles.basisFields}>
      <input
        className={`${styles.amount} ${bad ? styles.amountBad : ""}`}
        value={text}
        inputMode="decimal"
        placeholder="сколько нужно"
        aria-label={`Количество: ${label}`}
        aria-invalid={bad}
        title={bad ? "Нужно положительное число — или пусто: сколько нужно" : undefined}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const amount = parseAmount(e.target.value);
          if (amount !== undefined) onChange({ ...value, amount });
        }}
      />
      <select
        className={styles.select}
        value={value.unit}
        aria-label={`Единица: ${label}`}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, unit: e.target.value as BalanceUnit })}
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
