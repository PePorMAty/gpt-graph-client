import { useMemo, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { buildLegend } from "../../utils/presentationColors";
import styles from "./GraphLegend.module.css";

/**
 * Плавающая легенда цветов на полотне: показывает соответствие
 * «цвет → презентация (источник)» по реестру presentationColors.
 * По умолчанию свёрнута — видна только кнопка «Легенда».
 * Если у графа нет презентаций — не рендерится вовсе.
 */
export const GraphLegend = () => {
  const { data, presentationColors } = useAppSelector((s) => s.graph);
  const [open, setOpen] = useState(false);

  const hasCommonNodes = useMemo(
    () =>
      data.nodes.some((n) => {
        if (n.type !== "product") return false;
        const pres = n.data?.presentations;
        return Array.isArray(pres) && pres.length > 1;
      }),
    [data.nodes],
  );

  const entries = useMemo(
    () => buildLegend(presentationColors, hasCommonNodes),
    [presentationColors, hasCommonNodes],
  );

  if (entries.length === 0) return null;

  // Свёрнуто: компактная кнопка с превью-точками.
  if (!open) {
    return (
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen(true)}
        title="Показать легенду цветов"
      >
        <span className={styles.toggleDots} aria-hidden>
          {entries.slice(0, 3).map((entry) => (
            <span
              key={entry.name}
              className={styles.dot}
              style={{ background: entry.swatch }}
            />
          ))}
        </span>
        Легенда
      </button>
    );
  }

  // Развёрнуто: полная легенда с кнопкой «свернуть».
  return (
    <div className={styles.legend}>
      <div className={styles.header}>
        <span className={styles.title}>Легенда</span>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => setOpen(false)}
          title="Скрыть легенду"
          aria-label="Скрыть легенду"
        >
          ×
        </button>
      </div>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li
            key={entry.name}
            className={`${styles.item} ${
              entry.isCommon ? styles.itemCommon : ""
            }`}
          >
            <span
              className={styles.swatch}
              style={{ background: entry.swatch }}
              aria-hidden
            />
            <span className={styles.name}>{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
