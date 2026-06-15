import type { FC } from "react";

import styles from "./Notification.module.css";

interface NotificationProps {
  message: string;
  isVisible: boolean;
}

export const Notification: FC<NotificationProps> = ({ message, isVisible }) => {
  return (
    <div
      className={`${styles.notification} ${
        isVisible ? styles.notificationVisible : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon}>✓</span>
      <span className={styles.text}>{message}</span>
    </div>
  );
};
