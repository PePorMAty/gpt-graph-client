import type { FC } from "react";
import { dismissToast, useSoundToggle, useToasts } from "./toastStore";
import styles from "./Toast.module.css";

export const ToastContainer: FC = () => {
  const toasts = useToasts();
  const [soundEnabled, toggleSound] = useSoundToggle();

  if (!toasts.length) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
          <span className={styles.text}>{t.text}</span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleSound}
            title={
              soundEnabled
                ? "Выключить звук уведомлений"
                : "Включить звук уведомлений"
            }
          >
            {soundEnabled ? "🔔" : "🔕"}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => dismissToast(t.id)}
            title="Закрыть"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
