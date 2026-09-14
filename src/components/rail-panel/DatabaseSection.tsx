import { useMemo, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { IndustryGraphPanel } from "../industry/IndustryGraphPanel";
import { SourcesSection } from "./SourcesSection";
import styles from "./PanelSection.module.css";

type View = "sources" | "industry";

const VIEWS: Array<[View, string]> = [
  ["sources", "Источники графа"],
  ["industry", "Промышленное знание"],
];

/**
 * Раздел «База данных» левого рельса.
 *
 * Сюда стекается всё, на что граф опирается: источники, найденные при
 * построении, и записи реестра промышленной продукции по его продуктам. Это
 * разные ответы на один вопрос — «откуда это известно», — поэтому они лежат в
 * одном разделе и переключаются, а не соседствуют двумя списками.
 */
export const DatabaseSection = () => {
  const [view, setView] = useState<View>("sources");
  const nodes = useAppSelector((s) => s.graph.data.nodes);

  const productNames = useMemo(
    () => [
      ...new Set(
        nodes
          .filter((n) => n.type === "product")
          .map((n) => String(n.data?.label ?? "").trim())
          .filter(Boolean),
      ),
    ],
    [nodes],
  );

  return (
    <div className={styles.section}>
      <div className={styles.viewSwitch}>
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${styles.viewBtn} ${view === value ? styles.viewBtnActive : ""}`}
            onClick={() => setView(value)}
            aria-pressed={view === value}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "sources" ? (
        <SourcesSection />
      ) : (
        <IndustryGraphPanel productNames={productNames} compact />
      )}
    </div>
  );
};
