import { useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { renamePresentation } from "../../store/slices/gptSlice";
import { buildLegend } from "../../utils/presentationColors";
import styles from "./GraphLegend.module.css";

/**
 * Плавающая легенда цветов на полотне: показывает соответствие
 * «цвет → презентация (источник)» по реестру presentationColors.
 * По умолчанию свёрнута — видна только кнопка «Легенда».
 * Если у графа нет презентаций — не рендерится вовсе.
 */
export const GraphLegend = () => {
  const dispatch = useAppDispatch();
  const { data, presentationColors } = useAppSelector((s) => s.graph);
  const [open, setOpen] = useState(false);
  // Имя редактируемого пункта (null — правок нет) и текущий текст поля.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEdit = (name: string) => {
    setEditing(name);
    setDraft(name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
    setError(null);
  };

  const commitEdit = () => {
    if (editing === null) return;
    const to = draft.trim();
    if (!to || to === editing) {
      cancelEdit();
      return;
    }
    if (to in presentationColors) {
      setError("Такое название уже есть");
      return;
    }
    dispatch(renamePresentation({ from: editing, to }));
    cancelEdit();
  };

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
              <span className={styles.name}>{entry.name}</span>
            )}
            {/* «Общие узлы» — служебный пункт, а не презентация: не правим. */}
            {!entry.isCommon && editing !== entry.name && (
              <button
                type="button"
                className={styles.renameBtn}
                onClick={() => startEdit(entry.name)}
                title="Переименовать"
                aria-label={`Переименовать «${entry.name}»`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};
