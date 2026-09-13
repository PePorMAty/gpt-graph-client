import { useCallback, useEffect, useRef, type FC } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { FlaskIcon, GearIcon } from "../icons";
import styles from "./NodeContextMenu.module.css";

interface PaneContextMenuProps {
  x: number;
  y: number;
  /** Добавить узел выбранного типа в точке вызова меню. */
  onAdd: (type: "product" | "transformation") => void;
  onClose: () => void;
}

/**
 * Меню по правому клику на пустом месте полотна — добавление узла.
 * Отдельной кнопки для этого больше нет: узел создаётся там, где кликнули.
 */
export const PaneContextMenu: FC<PaneContextMenuProps> = ({
  x,
  y,
  onAdd,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(menuRef, close, true);

  // Меню не должно вылезать за край окна.
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (y + rect.height > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, [x, y]);

  return (
    <div ref={menuRef} className={styles.menu} style={{ top: y, left: x }}>
      <button type="button" className={styles.item} onClick={() => onAdd("product")}>
        <FlaskIcon size={16} className={styles.itemIcon} />
        Добавить продукт
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => onAdd("transformation")}
      >
        <GearIcon size={16} className={styles.itemIcon} />
        Добавить преобразование
      </button>
    </div>
  );
};
