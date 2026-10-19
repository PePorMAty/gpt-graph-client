import type { FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { setBalanceDisplay } from "../../store/slices/materialBalanceSlice";
import type { BalanceDisplay } from "../../utils/materialBalance";
import styles from "./MaterialBalance.module.css";

const OPTIONS: Array<{ id: BalanceDisplay; text: string; title: string }> = [
  {
    id: "percent",
    text: "%",
    title: "Доли массы: приход (всё сырьё) — 100 %, расход (продукты, побочные, отходы, потери) — 100 %",
  },
  {
    id: "mass",
    text: "т",
    title: "Массы на ваше количество сырья — в кг, т или тыс. т; количество сырья задаётся прямо в таблице",
  },
];

/**
 * Переключатель «% / т»: баланс долями или массами. Сначала — проценты:
 * они от количества не зависят. Выбор общий для вкладки, карточки и подписей
 * на полотне.
 */
export const DisplaySwitch: FC = () => {
  const dispatch = useAppDispatch();
  const display = useAppSelector((s) => s.materialBalance.display);
  return (
    <span className={styles.displaySwitch} role="group" aria-label="Баланс в процентах или в массах">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`${styles.displayBtn} ${display === o.id ? styles.displayBtnOn : ""}`}
          aria-pressed={display === o.id}
          title={o.title}
          onClick={() => dispatch(setBalanceDisplay(o.id))}
        >
          {o.text}
        </button>
      ))}
    </span>
  );
};
