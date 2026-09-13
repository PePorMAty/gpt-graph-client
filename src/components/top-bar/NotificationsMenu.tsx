import { useCallback, useRef, useState } from "react";

import { useDismiss } from "../../hooks/useDismiss";
import {
  getSoundVolume,
  isSoundEnabled,
  setSoundEnabled,
  setSoundVolume,
} from "../toast/chime";
import { BellIcon } from "../icons";
import styles from "./NotificationsMenu.module.css";

/**
 * Колокольчик в шапке: настройка звука уведомлений.
 *
 * Список завершённых операций сюда ещё не подключён — пока в приложении их
 * показывают всплывающие тосты, отдельной ленты событий нет. Звук же
 * настраивается уже сейчас: громкость и вкл/выкл лежат в chime.ts и
 * переживают перезагрузку.
 */
export const NotificationsMenu = () => {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(isSoundEnabled);
  const [volume, setVolume] = useState(getSoundVolume);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  return (
    <div className={styles.wrap} ref={menuRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Уведомления"
        aria-expanded={open}
      >
        <BellIcon size={18} />
        {enabled && <span className={styles.dot} aria-hidden />}
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.head}>Уведомления</div>

          <label className={styles.row}>
            <span className={styles.rowLabel}>Звук по завершении операции</span>
            <input
              type="checkbox"
              className={styles.switch}
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
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
            disabled={!enabled}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setVolume(next);
              setSoundVolume(next);
            }}
            aria-label="Громкость уведомлений"
          />

          <div className={styles.note}>
            Лента завершённых операций появится позже — сейчас о результатах
            сообщают всплывающие уведомления.
          </div>
        </div>
      )}
    </div>
  );
};
