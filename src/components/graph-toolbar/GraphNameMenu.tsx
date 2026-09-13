import { useCallback, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { renamePresentation } from "../../store/slices/gptSlice";
import { buildLegend } from "../../utils/presentationColors";
import { useDismiss } from "../../hooks/useDismiss";
import { ChevronDownIcon, PencilIcon, PlantIcon } from "../icons";
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

  // Правка названия презентации: имя редактируемого пункта + черновик.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasCommonNodes = useMemo(
    () =>
      data.nodes.some(
        (n) =>
          n.type === "product" &&
          Array.isArray(n.data?.presentations) &&
          n.data.presentations.length > 1,
      ),
    [data.nodes],
  );

  const legend = useMemo(
    () => buildLegend(presentationColors, hasCommonNodes),
    [presentationColors, hasCommonNodes],
  );

  const counts = useMemo(() => {
    let products = 0;
    let transformations = 0;
    for (const n of data.nodes) {
      if (n.type === "product") products += 1;
      else if (n.type === "transformation") transformations += 1;
    }
    return { products, transformations, edges: data.edges.length };
  }, [data.nodes, data.edges]);

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
    setError(null);
  };

  const commitEdit = () => {
    if (editing === null) return;
    const to = draft.trim();
    if (!to || to === editing) return cancelEdit();
    if (to in presentationColors) {
      setError("Такое название уже есть");
      return;
    }
    dispatch(renamePresentation({ from: editing, to }));
    cancelEdit();
  };

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

          {legend.length > 0 && (
            <>
              <div className={styles.sectionHead}>Легенда</div>
              <ul className={styles.legend}>
                {legend.map((entry) => (
                  <li
                    key={entry.name}
                    className={`${styles.legendItem} ${
                      entry.isCommon ? styles.legendItemCommon : ""
                    }`}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: entry.swatch }}
                      aria-hidden
                    />
                    {editing === entry.name ? (
                      <input
                        className={styles.nameInput}
                        value={draft}
                        autoFocus
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setError(null);
                        }}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <span className={styles.legendName}>{entry.name}</span>
                    )}
                    {/* «Общие узлы» — служебный пункт, а не презентация. */}
                    {!entry.isCommon && editing !== entry.name && (
                      <button
                        type="button"
                        className={styles.renameBtn}
                        onClick={() => {
                          setEditing(entry.name);
                          setDraft(entry.name);
                          setError(null);
                        }}
                        aria-label={`Переименовать «${entry.name}»`}
                      >
                        <PencilIcon size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {error && <div className={styles.error}>{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};
