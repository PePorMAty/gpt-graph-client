import { useCallback, useRef, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { useDismiss } from "../../hooks/useDismiss";
import { buildSaveGraphPayload } from "../../utils/buildSaveGraphPayload";
import { exportGraphJson } from "../../utils/exportGraph";
import { showToast } from "../toast/toastStore";
import {
  ChevronDownIcon,
  ExportIcon,
  FileJsonIcon,
  ShareIcon,
} from "../icons";
import styles from "./ExportMenu.module.css";

interface ExportMenuProps {
  /** Открыть модалку публикации графа по ссылке. */
  onShare: () => void;
}

/**
 * Меню выгрузки графа в шапке: файл графа и ссылка на просмотр.
 * Публикация по ссылке переехала сюда с полотна — на холсте её кнопки больше нет.
 */
export const ExportMenu = ({ onShare }: ExportMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, close, open);

  const {
    data,
    leafNodes,
    hasMore,
    originalPrompt,
    sourcesPool,
    sourcesSeqCounter,
  } = useAppSelector((s) => s.graph);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);

  const isEmpty = data.nodes.length === 0;
  const displayName = graphName || originalPrompt;

  const handleJson = () => {
    exportGraphJson(
      buildSaveGraphPayload({
        name: displayName ?? undefined,
        originalPrompt,
        nodes: data.nodes,
        edges: data.edges,
        leafNodes,
        hasMore,
        sourcesPool,
        sourcesSeqCounter,
      }),
      displayName,
    );
    showToast("success", "Файл графа сохранён");
    close();
  };

  return (
    <div className={styles.wrap} ref={menuRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ExportIcon size={16} />
        Экспорт
        <ChevronDownIcon size={14} className={styles.caret} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHead}>Выгрузить граф</div>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={handleJson}
            disabled={isEmpty}
          >
            <FileJsonIcon size={17} className={styles.itemIcon} />
            <span className={styles.itemText}>
              <span className={styles.itemTitle}>Файл графа (JSON)</span>
              <span className={styles.itemHint}>
                Можно загрузить обратно или объединить с другим
              </span>
            </span>
          </button>

          <div className={styles.divider} />

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              onShare();
              close();
            }}
            disabled={isEmpty}
          >
            <ShareIcon size={17} className={styles.itemIcon} />
            <span className={styles.itemText}>
              <span className={styles.itemTitle}>Поделиться ссылкой</span>
              <span className={styles.itemHint}>
                Ссылка на просмотр без редактирования
              </span>
            </span>
          </button>

          {isEmpty && (
            <div className={styles.emptyNote}>
              Полотно пустое — выгружать нечего.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
