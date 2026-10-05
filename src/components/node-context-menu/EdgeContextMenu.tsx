import { useCallback, useEffect, useRef, type FC } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { TrashIcon } from "../icons";
import styles from "./NodeContextMenu.module.css";

interface EdgeContextMenuProps {
  x: number;
  y: number;
  /** Откуда и куда ведёт связь — подписи узлов, для заголовка меню. */
  sourceLabel: string;
  targetLabel: string;
  onDelete: () => void;
  onClose: () => void;
}

/** Обрезать длинную подпись узла, чтобы заголовок меню остался в строку. */
function short(label: string, max = 28): string {
  const s = label.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Меню по правому клику на связи — удаление связи.
 *
 * Раньше связь удалялась только перетаскиванием её конца в пустоту, и об этом
 * никто не знал. Заголовок называет оба конца: на густом графе линии
 * пересекаются, и без него не видно, по какой именно связи попали.
 */
export const EdgeContextMenu: FC<EdgeContextMenuProps> = ({
  x,
  y,
  sourceLabel,
  targetLabel,
  onDelete,
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

  // Закрываем и при панорамировании/зуме: меню привязано к точке экрана.
  useEffect(() => {
    const handle = () => onClose();
    window.addEventListener("wheel", handle, { passive: true });
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("wheel", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className={styles.menu} style={{ top: y, left: x }}>
      <div className={styles.header} title={`${sourceLabel} → ${targetLabel}`}>
        {short(sourceLabel)} → {short(targetLabel)}
      </div>
      <div className={styles.separator} />
      <button
        type="button"
        className={`${styles.item} ${styles.itemDanger}`}
        onClick={onDelete}
      >
        <TrashIcon size={16} className={styles.itemIcon} />
        Удалить связь
      </button>
    </div>
  );
};
