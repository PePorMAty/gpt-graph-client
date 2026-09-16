import { useMemo, useState, type FC } from "react";

import { buildLegend } from "../../utils/presentationColors";
import { PencilIcon } from "../icons";
import styles from "./LegendList.module.css";

interface Props {
  /** Реестр «презентация → цвет»; порядок ключей задаёт порядок легенды. */
  colors: Record<string, string>;
  /** Есть ли узлы сразу из нескольких презентаций — пункт «Общие узлы». */
  hasCommonNodes: boolean;
  /**
   * Переименовать презентацию. Не передан — легенда только для чтения
   * (карандаши не показываем).
   */
  onRename?: (from: string, to: string) => void;
  /** Классы хозяина: меню в шапке и окно объединения оформлены по-разному. */
  className?: string;
}

/**
 * Легенда презентаций с правкой названий.
 *
 * Один и тот же список нужен в меню графа, на вкладке загрузки и в превью
 * объединения. Данные приходят снаружи, потому что источник у них разный: на
 * полотне это стор, а в превью — результат, посчитанный мимо стора. Само
 * редактирование (черновик, проверка на занятое имя, Enter/Escape) живёт здесь,
 * чтобы три экрана не разъехались.
 *
 * Пункт «Общие узлы» служебный — это не презентация, и переименовывать его
 * нечего.
 */
export const LegendList: FC<Props> = ({
  colors,
  hasCommonNodes,
  onRename,
  className,
}) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const legend = useMemo(
    () => buildLegend(colors, hasCommonNodes),
    [colors, hasCommonNodes],
  );

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
    setError(null);
  };

  const commitEdit = () => {
    if (editing === null) return;
    const to = draft.trim();
    if (!to || to === editing) return cancelEdit();
    // Слияние с существующим именем потеряло бы цвет одной из презентаций.
    if (to in colors) {
      setError("Такое название уже есть");
      return;
    }
    onRename?.(editing, to);
    cancelEdit();
  };

  if (!legend.length) return null;

  return (
    <>
      <ul className={`${styles.legend} ${className ?? ""}`}>
        {legend.map((entry) => (
          <li
            key={entry.name}
            className={`${styles.item} ${entry.isCommon ? styles.itemCommon : ""}`}
          >
            <span
              className={styles.swatch}
              style={{ background: entry.swatch }}
              aria-hidden
            />
            {editing === entry.name ? (
              <input
                className={styles.input}
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
              <span className={styles.name} title={entry.name}>
                {entry.name}
              </span>
            )}
            {onRename && !entry.isCommon && editing !== entry.name && (
              <button
                type="button"
                className={styles.renameBtn}
                onClick={() => {
                  setEditing(entry.name);
                  setDraft(entry.name);
                  setError(null);
                }}
                aria-label={`Переименовать «${entry.name}»`}
                title="Переименовать"
              >
                <PencilIcon size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <div className={styles.error}>{error}</div>}
    </>
  );
};
