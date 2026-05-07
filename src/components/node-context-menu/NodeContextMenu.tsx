import { useEffect, useRef, type FC } from "react";
import styles from "./NodeContextMenu.module.css";

interface NodeContextMenuProps {
  x: number;
  y: number;
  isProduct: boolean;
  isStepAlt?: boolean;
  hasDirectProductNeighbors?: boolean;
  onBuildUp: () => void;
  onBuildDown: () => void;
  onBuildAlt?: () => void;
  onInsertTransformation?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const NodeContextMenu: FC<NodeContextMenuProps> = ({
  x,
  y,
  isProduct,
  isStepAlt,
  hasDirectProductNeighbors,
  onBuildUp,
  onBuildDown,
  onBuildAlt,
  onInsertTransformation,
  onDelete,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Viewport boundary adjustment
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;

    if (x + rect.width > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (y + rect.height > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, [x, y]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on scroll / wheel (captures panning and zooming)
  useEffect(() => {
    const handle = () => onClose();
    window.addEventListener("wheel", handle, { passive: true });
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("wheel", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ top: y, left: x }}
    >
      {isProduct && (
        <>
          <button className={styles.item} onClick={onBuildUp}>
            Построить вверх
          </button>
          <button className={styles.item} onClick={onBuildDown}>
            Построить вниз
          </button>
          <div className={styles.separator} />
        </>
      )}
      {isStepAlt && onBuildAlt && (
        <>
          <button className={styles.item} onClick={onBuildAlt}>
            Построить альтернативу
          </button>
          <div className={styles.separator} />
        </>
      )}
      {isProduct && hasDirectProductNeighbors && onInsertTransformation && (
        <>
          <button className={styles.item} onClick={onInsertTransformation}>
            Получить преобразование с соседом
          </button>
          <div className={styles.separator} />
        </>
      )}
      <button className={`${styles.item} ${styles.itemDanger}`} onClick={onDelete}>
        Удалить
      </button>
    </div>
  );
};
