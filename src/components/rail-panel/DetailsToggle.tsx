import type { FC } from "react";

import { FilterIcon } from "../icons";
import styles from "./PanelDetails.module.css";

interface Props {
  open: boolean;
  onToggle: () => void;
  /** Отбор включён, а сводка скрыта — точка на кнопке напоминает о нём. */
  active?: boolean;
}

/** Кнопка рядом с поиском боковой панели: показать или скрыть сводку и отборы. */
export const DetailsToggle: FC<Props> = ({ open, onToggle, active = false }) => {
  const label = open ? "Скрыть сводку и отборы" : "Показать сводку и отборы";
  return (
    <button
      type="button"
      className={`${styles.toggle} ${open ? styles.toggleOpen : ""}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      title={label}
    >
      <FilterIcon size={16} />
      {active && !open && <span className={styles.dot} aria-hidden />}
    </button>
  );
};
