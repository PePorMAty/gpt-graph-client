import { useEffect, useState, type FC } from "react";

import {
  BALANCE_UNITS,
  convertUnit,
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
  /** Подписи продуктов-кандидатов в базис: P1 — исходный, P2 — целевой. */
  names: { P1: string; P2: string };
  onChange: (view: BalanceView) => void;
}

/**
 * Базис: количество, единица и чей продукт. Числа на узлах и во вкладке
 * пересчитываются сразу — модель для этого не нужна. Единица переводит
 * количество (1 т → 1000 кг), а не меняет его смысл.
 *
 * Количество держим строкой: иначе «1,» на полпути к «1,5» превращалось бы
 * в «1», и дробное число было бы не вписать.
 */
export const BasisFields: FC<Props> = ({ view, names, onChange }) => {
  const [text, setText] = useState(() => String(view.amount).replace(".", ","));
  useEffect(() => {
    // Базис сменился снаружи (другой расчёт) — показать его число.
    if (parseAmount(text) !== view.amount) setText(String(view.amount).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.amount]);

  const bad = parseAmount(text) === null;
  return (
    <>
      <span className={styles.fieldLabel}>Базис</span>
      <input
        className={`${styles.amount} ${bad ? styles.amountBad : ""}`}
        value={text}
        inputMode="decimal"
        aria-label="Количество"
        aria-invalid={bad}
        title={bad ? "Нужно положительное число" : undefined}
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
        // Смена единицы переводит количество: 1 т → 1000 кг, массы те же.
        onChange={(e) => onChange(convertUnit(view, e.target.value as BalanceUnit))}
      >
        {BALANCE_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={view.ref}
        aria-label="Чьё количество"
        title="Чьё это количество: исходного продукта или целевого — «сколько сырья нужно на столько-то продукта»"
        onChange={(e) => onChange({ ...view, ref: e.target.value })}
      >
        <option value="P1">{names.P1 || "исходного продукта"}</option>
        <option value="P2">{names.P2 || "целевого продукта"}</option>
      </select>
    </>
  );
};
