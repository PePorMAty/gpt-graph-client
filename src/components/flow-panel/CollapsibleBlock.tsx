import { useState, type ReactNode } from "react";

import { ChevronDownIcon } from "../icons";
import styles from "./NodeCard.module.css";

interface CollapsibleBlockProps {
  title: string;
  /** Число в скобках после заголовка (источники, связанные продукты). */
  count?: number;
  icon?: ReactNode;
  /** Раскрыт ли блок при первом показе. */
  defaultOpen?: boolean;
  /** Кнопки справа в шапке блока (например, «Редактировать»). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Блок карточки узла со сворачиваемым содержимым: «Описание», «Связанные
 * продукты», «Источники». Раскрытие локальное — состояние не поднимается,
 * карточка и так пересоздаётся при смене узла (key по nodeId).
 */
export const CollapsibleBlock = ({
  title,
  count,
  icon,
  defaultOpen = true,
  actions,
  children,
}: CollapsibleBlockProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <button
          type="button"
          className={styles.blockToggle}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {icon && <span className={styles.blockIcon}>{icon}</span>}
          <span className={styles.blockTitle}>
            {title}
            {typeof count === "number" && ` (${count})`}
          </span>
          <ChevronDownIcon
            size={16}
            className={`${styles.blockCaret} ${open ? "" : styles.blockCaretClosed}`}
          />
        </button>
        {actions && <div className={styles.blockActions}>{actions}</div>}
      </div>

      {open && <div className={styles.blockBody}>{children}</div>}
    </section>
  );
};
