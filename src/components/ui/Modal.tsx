import { useCallback, useRef, type ReactNode } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import { CloseIcon } from "../icons";
import styles from "./Modal.module.css";

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

  if (!open) return null;

  return (
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
    </div>
  );
};
