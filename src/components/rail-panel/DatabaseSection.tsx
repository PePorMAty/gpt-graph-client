import { useMemo, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { codeOverridesByProduct } from "../industry/codeOverrides";
import { IndustryGraphPanel } from "../industry/IndustryGraphPanel";
import { LocalSourcesPanel } from "./LocalSourcesPanel";
import { SourcesSection } from "./SourcesSection";
import styles from "./PanelSection.module.css";

type View = "sources" | "industry" | "local";

const VIEWS: Array<[View, string]> = [
  ["sources", "Источники графа"],
  ["industry", "Промышленное знание"],
  ["local", "База источников"],
];

/**
 * Раздел «База данных» левого рельса.
 *
 * Сюда стекается всё, на что граф опирается: источники, найденные при
 * построении, записи реестра промышленной продукции по его продуктам и база
 * источников на сервере — разделы документов заказчика. Это разные ответы
 * на один вопрос — «откуда это известно», — поэтому они лежат в одном
 * разделе и переключаются, а не соседствуют несколькими списками.
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
  const codeOverrides = useMemo(() => codeOverridesByProduct(nodes), [nodes]);

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

      <div className={styles.viewBody}>
        {view === "sources" ? (
          <SourcesSection />
        ) : view === "industry" ? (
          <IndustryGraphPanel
            productNames={productNames}
            codeOverrides={codeOverrides}
            compact
          />
        ) : (
          <LocalSourcesPanel productNames={productNames} />
        )}
      </div>
    </div>
  );
};
