import { useCallback, useEffect, useRef, type FC } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { BookmarkIcon, TrashIcon } from "../icons";
import styles from "./NodeContextMenu.module.css";

interface NodeContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  /** Кол-во выделенных нод. Если > 1 — меню показывает групповое удаление. */
  selectedCount?: number;
  /** Узел уже в закладках — пункт меняется на «убрать». */
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onClose: () => void;
}

export const NodeContextMenu: FC<NodeContextMenuProps> = ({
  x,
  y,
  onDelete,
  selectedCount,
  isBookmarked = false,
  onToggleBookmark,
  onClose,
}) => {
  const isMultiSelection = !!selectedCount && selectedCount > 1;
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
      {isMultiSelection && (
        <>
          <div className={styles.header}>Выделено нод: {selectedCount}</div>
          <div className={styles.separator} />
        </>
      )}

      {/* Закладка ставится на один узел: групповое выделение сюда не идёт. */}
      {!isMultiSelection && onToggleBookmark && (
        <button type="button" className={styles.item} onClick={onToggleBookmark}>
          <BookmarkIcon size={16} className={styles.itemIcon} />
          {isBookmarked ? "Убрать из закладок" : "Добавить в закладки"}
        </button>
      )}

      <button
        type="button"
        className={`${styles.item} ${styles.itemDanger}`}
        onClick={onDelete}
      >
        <TrashIcon size={16} className={styles.itemIcon} />
        {isMultiSelection ? `Удалить выбранные (${selectedCount})` : "Удалить"}
      </button>
    </div>
  );
};
