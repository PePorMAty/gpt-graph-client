import { useCallback, useRef, useState } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { HelpIcon } from "../icons";
import styles from "./HelpMenu.module.css";

/** Обозначения узлов на полотне — те же цвета, что и на графе. */
const LEGEND = [
  { color: "var(--c-product)", label: "Продукт" },
  { color: "var(--c-transform)", label: "Преобразование" },
  { color: "var(--c-alt)", label: "Альтернативный маршрут" },
];

const SHORTCUTS = [
  { keys: "⌘ K", text: "Поиск по графу" },
  { keys: "ЛКМ", text: "Открыть карточку узла" },
  { keys: "ПКМ", text: "Меню узла" },
  { keys: "Shift + протяжка", text: "Выделить рамкой" },
  { keys: "Ctrl / ⌘ + клик", text: "Добавить узел к выделению" },
  { keys: "Esc", text: "Закрыть панель или меню" },
];

/** Краткая справка по интерфейсу: обозначения и горячие клавиши. */
export const HelpMenu = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  return (
    <div className={styles.wrap} ref={menuRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Справка"
        aria-expanded={open}
      >
        <HelpIcon size={18} />
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.head}>Обозначения</div>
          <ul className={styles.legend}>
            {LEGEND.map((item) => (
              <li key={item.label} className={styles.legendItem}>
                <span
                  className={styles.swatch}
                  style={{ background: item.color }}
                  aria-hidden
                />
                {item.label}
              </li>
            ))}
          </ul>

          <div className={styles.head}>Горячие клавиши</div>
          <ul className={styles.shortcuts}>
            {SHORTCUTS.map((item) => (
              <li key={item.keys} className={styles.shortcut}>
                <kbd className={styles.kbd}>{item.keys}</kbd>
                <span className={styles.shortcutText}>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
