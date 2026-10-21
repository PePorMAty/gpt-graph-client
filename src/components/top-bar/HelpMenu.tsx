import { useCallback, useRef, useState } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { BookIcon, HelpIcon } from "../icons";
import styles from "./HelpMenu.module.css";

/** Обозначения на полотне — те же цвета, что и на графе. line — связь, а не узел. */
const LEGEND: { color: string; label: string; line?: boolean }[] = [
  { color: "var(--c-product)", label: "Продукт" },
  { color: "var(--c-transform)", label: "Преобразование" },
  { color: "var(--c-alt)", label: "Альтернативный маршрут" },
  // Связь назад — рециклинг или продукт выше — пунктир (styles/Flow.module.css, .edge--recycle).
  { color: "#0d9488", label: "Связь назад, к узлу выше", line: true },
];

const SHORTCUTS = [
  { keys: "⌘ K", text: "Поиск по графу" },
  { keys: "ЛКМ", text: "Открыть карточку узла" },
  { keys: "ПКМ", text: "Меню узла" },
  { keys: "Shift + протяжка", text: "Выделить рамкой" },
  { keys: "Ctrl / ⌘ + клик", text: "Добавить узел к выделению" },
  { keys: "Esc", text: "Закрыть панель или меню" },
];

/** Руководство пользователя — страница /guide приложения. */
const GUIDE_HREF = `${import.meta.env.BASE_URL}guide`;
/** Юридические страницы — статичные файлы рядом с приложением (public/). */
const TERMS_HREF = `${import.meta.env.BASE_URL}terms.html`;
const PRIVACY_HREF = `${import.meta.env.BASE_URL}privacy.html`;

/**
 * Краткая справка по интерфейсу: обозначения, горячие клавиши и ссылка на
 * руководство пользователя (в новой вкладке — граф на полотне остаётся).
 */
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
                  className={item.line ? styles.swatchLine : styles.swatch}
                  style={
                    item.line ? { color: item.color } : { background: item.color }
                  }
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

          <a
            className={styles.guide}
            href={GUIDE_HREF}
            target="_blank"
            rel="noopener"
            onClick={close}
          >
            <BookIcon size={16} />
            Руководство пользователя
          </a>
          <div className={styles.legal}>
            <a href={TERMS_HREF} target="_blank" rel="noopener" onClick={close}>
              Пользовательское соглашение
            </a>
            <a href={PRIVACY_HREF} target="_blank" rel="noopener" onClick={close}>
              Политика конфиденциальности
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
