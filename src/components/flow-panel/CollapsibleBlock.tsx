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
  /**
   * Раскрытием управляет родитель.
   *
   * Нужно там, где содержимое блока появляется у уже открытой карточки:
   * defaultOpen читается один раз при монтировании, и блок, свёрнутый пустым,
   * так и остался бы свёрнутым — новое содержимое человек бы не увидел.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Кнопки справа в шапке блока (например, «Редактировать»). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Блок карточки узла со сворачиваемым содержимым: «Описание», «Связанные
 * продукты», «Источники». По умолчанию раскрытие локальное — состояние не
 * поднимается, карточка и так пересоздаётся при смене узла (key по nodeId).
 */
export const CollapsibleBlock = ({
  title,
  count,
  icon,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  actions,
  children,
}: CollapsibleBlockProps) => {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <button
          type="button"
          className={styles.blockToggle}
          onClick={() => setOpen(!open)}
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
