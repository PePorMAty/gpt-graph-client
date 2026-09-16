import { useCallback, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { renamePresentation } from "../../store/slices/gptSlice";
import { hasCommonProductNodes } from "../../utils/presentationColors";
import { useDismiss } from "../../hooks/useDismiss";
import { LegendList } from "../legend/LegendList";
import { ChevronDownIcon, PlantIcon } from "../icons";
import styles from "./GraphNameMenu.module.css";

interface GraphNameMenuProps {
  /** Название текущего графа; пусто — граф ещё не создан. */
  name: string;
}

/**
 * Чип с названием графа и его выпадающее меню.
 *
 * Сюда переехала легенда цветов презентаций: раньше она плавала отдельной
 * плашкой поверх полотна и на объединённых графах закрывала узлы.
 * Переименование презентации осталось прежним — правка пишется в реестр
 * цветов и в подписи узлов.
 */
export const GraphNameMenu = ({ name }: GraphNameMenuProps) => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, close, open);

  const { data, presentationColors } = useAppSelector((s) => s.graph);

  const hasCommonNodes = useMemo(
    () => hasCommonProductNodes(data.nodes),
    [data.nodes],
  );

  const hasLegend = Object.keys(presentationColors).length > 0 || hasCommonNodes;

  const counts = useMemo(() => {
    let products = 0;
    let transformations = 0;
    for (const n of data.nodes) {
      if (n.type === "product") products += 1;
      else if (n.type === "transformation") transformations += 1;
    }
    return { products, transformations, edges: data.edges.length };
  }, [data.nodes, data.edges]);

  const title = name || "Граф не создан";

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.chip} ${open ? styles.chipOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={title}
      >
        <PlantIcon size={17} className={styles.chipIcon} />
        <span className={styles.chipText}>{title}</span>
        <ChevronDownIcon size={14} className={styles.caret} />
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.menuTitle}>{title}</div>

          <div className={styles.stats}>
            <span>Продуктов: {counts.products}</span>
            <span>Преобразований: {counts.transformations}</span>
            <span>Связей: {counts.edges}</span>
          </div>

          {hasLegend && (
            <>
              <div className={styles.sectionHead}>Легенда</div>
              <LegendList
                colors={presentationColors}
                hasCommonNodes={hasCommonNodes}
                onRename={(from, to) =>
                  dispatch(renamePresentation({ from, to }))
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};
