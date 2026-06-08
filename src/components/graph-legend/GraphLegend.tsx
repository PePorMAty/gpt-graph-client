import { useMemo } from "react";

import { useAppSelector } from "../../store/hooks";
import { buildLegend } from "../../utils/presentationColors";
import styles from "./GraphLegend.module.css";

/**
 * Плавающая легенда цветов на полотне: показывает соответствие
 * «цвет → презентация (источник)» по реестру presentationColors.
 * Если у графа нет презентаций — не рендерится.
 */
export const GraphLegend = () => {
  const { data, presentationColors } = useAppSelector((s) => s.graph);

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

  return (
    <div className={styles.legend}>
      <div className={styles.title}>Легенда</div>
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
