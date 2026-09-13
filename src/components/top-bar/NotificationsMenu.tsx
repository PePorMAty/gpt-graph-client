import { useCallback, useRef, useState } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import {
  clearNotificationHistory,
  useNotificationHistory,
} from "../toast/toastStore";
import {
  getSoundVolume,
  isSoundEnabled,
  setSoundEnabled,
  setSoundVolume,
} from "../toast/chime";
import { BellIcon } from "../icons";
import styles from "./NotificationsMenu.module.css";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Колокольчик в шапке: лента завершённых операций и настройка звука.
 *
 * Лента нужна потому, что запросы к моделям идут минутами: всплывающий тост
 * успевает погаснуть до того, как пользователь вернётся к вкладке. Здесь тот
 * же поток уведомлений, но со временем и без автоскрытия.
 */
export const NotificationsMenu = () => {
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [volume, setVolume] = useState(getSoundVolume);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const history = useNotificationHistory();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  // Непрочитанное считаем грубо: пока ленту не открывали после последнего
  // уведомления, на колокольчике горит точка.
  const [seenCount, setSeenCount] = useState(0);
  const unread = Math.max(0, history.length - seenCount);

  const toggleOpen = () => {
    setOpen((v) => {
      if (!v) setSeenCount(history.length);
      return !v;
    });
  };

  return (
    <div className={styles.wrap} ref={menuRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={toggleOpen}
        aria-label={
          unread ? `Уведомления: новых ${unread}` : "Уведомления"
        }
        aria-expanded={open}
      >
        <BellIcon size={18} />
        {unread > 0 && <span className={styles.dot} aria-hidden />}
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.head}>
            <span className={styles.headTitle}>Уведомления</span>
            <div className={styles.headActions}>
              {history.length > 0 && (
                <button
                  type="button"
                  className={styles.headBtn}
                  onClick={() => {
                    clearNotificationHistory();
                    setSeenCount(0);
                  }}
                >
                  Очистить
                </button>
              )}
              <button
                type="button"
                className={styles.headBtn}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
              >
                {settingsOpen ? "Скрыть звук" : "Звук"}
              </button>
            </div>
          </div>

          {settingsOpen && (
            <div className={styles.settings}>
              <label className={styles.row}>
                <span className={styles.rowLabel}>
                  Звук по завершении операции
                </span>
                <input
                  type="checkbox"
                  className={styles.switch}
                  checked={soundOn}
                  onChange={(e) => {
                    setSoundOn(e.target.checked);
                    setSoundEnabled(e.target.checked);
                  }}
                />
              </label>

              <div className={styles.row}>
                <span className={styles.rowLabel}>Громкость</span>
                <span className={styles.volumeValue}>
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                className={styles.range}
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                disabled={!soundOn}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  setVolume(next);
                  setSoundVolume(next);
                }}
                aria-label="Громкость уведомлений"
              />
            </div>
          )}

          {history.length === 0 ? (
            <div className={styles.empty}>
              Здесь появятся результаты запросов: поиск источников, обобщение,
              построение шагов, сохранение графа.
            </div>
          ) : (
            <ul className={styles.list}>
              {history.map((item) => (
                <li key={item.id} className={styles.item}>
                  <span
                    className={`${styles.marker} ${styles[`marker_${item.kind}`]}`}
                    aria-hidden
                  />
                  <span className={styles.itemText}>{item.text}</span>
                  <span className={styles.itemTime}>{formatTime(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
