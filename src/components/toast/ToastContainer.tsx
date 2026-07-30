import type { FC } from "react";
import {
  dismissToast,
  useSoundToggle,
  useSoundVolume,
  useToasts,
} from "./toastStore";
import { playChime } from "./chime";
import styles from "./Toast.module.css";

export const ToastContainer: FC = () => {
  const toasts = useToasts();
  const [soundEnabled, toggleSound] = useSoundToggle();
  const [volume, setVolume] = useSoundVolume();

  if (!toasts.length) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
          <span className={styles.text}>{t.text}</span>
          <input
            type="range"
            className={styles.volume}
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            // Проиграть сигнал на новой громкости, когда ползунок отпущен —
            // так уровень подбирается на слух.
            onPointerUp={() => soundEnabled && playChime("success")}
            disabled={!soundEnabled}
            title={`Громкость звука уведомлений: ${Math.round(volume * 100)}%`}
            aria-label="Громкость звука уведомлений"
          />
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
