import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary — главное действие, secondary — рядовое, ghost — без рамки,
   *  danger — необратимое. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "s" | "m";
  /** Растянуть на всю ширину контейнера. */
  block?: boolean;
  /** Иконка перед подписью. */
  icon?: ReactNode;
}

/** Кнопка интерфейса. Единый размер, радиус и состояния для всего приложения. */
export const Button = ({
  variant = "secondary",
  size = "m",
  block = false,
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={[
      styles.button,
      styles[variant],
      styles[`size_${size}`],
      block ? styles.block : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {icon && <span className={styles.icon}>{icon}</span>}
    {children}
  </button>
);
