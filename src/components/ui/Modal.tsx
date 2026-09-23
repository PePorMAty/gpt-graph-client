import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDismiss } from "../../hooks/useDismiss";
import { CloseIcon } from "../icons";
import styles from "./Modal.module.css";

/**
 * Сколько окон открыто сейчас. Окна встречаются вложенными (превью объединения
 * поверх библиотеки), и закрытие верхнего не должно возвращать прокрутку, пока
 * под ним есть другое.
 */
let openModals = 0;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Подпись под заголовком. */
  subtitle?: ReactNode;
  /** Ряд кнопок внизу окна. */
  footer?: ReactNode;
  /** Ширина окна: s — короткие подтверждения, m — формы, l — таблицы. */
  size?: "s" | "m" | "l";
  children: ReactNode;
}

/**
 * Базовое модальное окно: затемнение, шапка с заголовком и крестиком,
 * прокручиваемое тело и необязательный подвал.
 *
 * Раньше каждая модалка приложения рисовала свой оверлей и свою шапку, с
 * разными радиусами, тенями и обработкой Escape. Здесь это одно место.
 *
 * Рисуется порталом в body. Экран библиотеки лежит в собственном слое
 * (z-index), и модалка, открытая изнутри него, оказывалась в том же слое —
 * то есть ниже верхней панели приложения: её шапку с заголовком и крестиком
 * закрывало собой меню. Портал выносит окно из чужого контекста наложения.
 */
export const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = "m",
  children,
}: ModalProps) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(windowRef, close, open);

  // Страница под окном не листается: иначе прокрутка мимо окна (или колесо по
  // затемнению) уводила экран за спиной у пользователя.
  useEffect(() => {
    if (!open) return;
    openModals += 1;
    document.body.style.overflow = "hidden";
    return () => {
      openModals -= 1;
      if (openModals <= 0) {
        openModals = 0;
        document.body.style.overflow = "";
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={windowRef}
        className={`${styles.window} ${styles[`size_${size}`]}`}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
