import { useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  removeBookmark,
  setBookmarkNote,
  type Bookmark,
} from "../../store/slices/bookmarksSlice";
import { useFocusNode } from "../../hooks/useFocusNode";
import {
  BookmarkIcon,
  ChevronDownIcon,
  FilterIcon,
  FlaskIcon,
  GearIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "../icons";
import styles from "./PanelSection.module.css";

type KindFilter = "all" | "product" | "transformation";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Все типы закладок",
  product: "Закладки продуктов",
  transformation: "Закладки преобразований",
};

/**
 * Раздел «Закладки»: узлы, которые пользователь отметил правым кликом на
 * полотне. Клик по названию подводит камеру и выделяет узел, карандаш правит
 * заметку.
 *
 * Закладки живут в памяти сессии и привязаны к id узлов текущего графа —
 * смена графа их сбрасывает (см. bookmarksSlice).
 */
export const BookmarksSection = () => {
  const dispatch = useAppDispatch();
  const focusNode = useFocusNode();

  const items = useAppSelector((s) => s.bookmarks.items);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const originalPrompt = useAppSelector((s) => s.graph.originalPrompt);
  const title = graphName || originalPrompt || "без названия";

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [kindOpen, setKindOpen] = useState(false);
  // Заметка, которую сейчас правят: id узла + черновик текста.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const counts = useMemo(() => {
    let products = 0;
    let transformations = 0;
    for (const b of items) {
      if (b.kind === "product") products += 1;
      else transformations += 1;
    }
    return { products, transformations };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((b) => {
      if (kind !== "all" && b.kind !== kind) return false;
      if (!q) return true;
      return (
        b.label.toLowerCase().includes(q) || b.note.toLowerCase().includes(q)
      );
    });
  }, [items, query, kind]);

  const startEdit = (b: Bookmark) => {
    setEditing(b.nodeId);
    setDraft(b.note);
  };

  const commitEdit = () => {
    if (editing === null) return;
    dispatch(setBookmarkNote({ nodeId: editing, note: draft.trim() }));
    setEditing(null);
    setDraft("");
  };

  const isEmpty = items.length === 0;

  return (
    <div className={styles.section}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <BookmarkIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{items.length}</span>
          <span className={styles.statLabel}>Всего закладок</span>
        </div>
        <div className={styles.stat}>
          <FlaskIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{counts.products}</span>
          <span className={styles.statLabel}>Закладки продуктов</span>
        </div>
        <div className={styles.stat}>
          <GearIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{counts.transformations}</span>
          <span className={styles.statLabel}>Закладки преобразований</span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.search}>
          <SearchIcon size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по закладкам…"
          />
        </div>

        <div className={styles.filter}>
          <button
            type="button"
            className={`${styles.filterBtn} ${kind !== "all" ? styles.filterBtnActive : ""}`}
            onClick={() => setKindOpen((v) => !v)}
            aria-expanded={kindOpen}
          >
            <FilterIcon size={15} className={styles.filterIcon} />
            {KIND_LABEL[kind]}
            <ChevronDownIcon size={14} className={styles.filterCaret} />
          </button>
          {kindOpen && (
            <div className={styles.filterMenu}>
              {(Object.keys(KIND_LABEL) as KindFilter[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.filterItem} ${
                    kind === k ? styles.filterItemActive : ""
                  }`}
                  onClick={() => {
                    setKind(k);
                    setKindOpen(false);
                  }}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          Закладок пока нет. Нажмите правой кнопкой на продукт или
          преобразование на полотне и выберите «Добавить в закладки».
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Ничего не найдено.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.colBookmarkObject} />
              <col className={styles.colBookmarkKind} />
              <col className={styles.colBookmarkNote} />
              <col className={styles.colBookmarkActions} />
            </colgroup>
            <thead>
              <tr>
                <th>Объект графа</th>
                <th>Тип</th>
                <th>Заметка</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.nodeId}>
                  <td>
                    <button
                      type="button"
                      className={styles.objectLink}
                      onClick={() => focusNode(b.nodeId)}
                      title={`Показать «${b.label}» на полотне`}
                    >
                      {b.kind === "product" ? (
                        <FlaskIcon size={14} className={styles.objectIconProduct} />
                      ) : (
                        <GearIcon size={14} className={styles.objectIconTransform} />
                      )}
                      <span className={styles.objectLinkLabel}>{b.label}</span>
                    </button>
                  </td>
                  <td>
                    <span
                      className={`${styles.kindBadge} ${
                        b.kind === "product"
                          ? styles.kindProduct
                          : styles.kindTransform
                      }`}
                    >
                      {b.kind === "product" ? "Продукт" : "Преобразование"}
                    </span>
                  </td>
                  <td className={styles.noteCell}>
                    {editing === b.nodeId ? (
                      <input
                        className={styles.noteInput}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        placeholder="Заметка"
                      />
                    ) : b.note ? (
                      b.note
                    ) : (
                      <span className={styles.notePlaceholder}>—</span>
                    )}
                  </td>
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.rowBtn}
                      onClick={() => startEdit(b)}
                      aria-label="Редактировать заметку"
                      title="Редактировать заметку"
                    >
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                      onClick={() => dispatch(removeBookmark(b.nodeId))}
                      aria-label="Удалить закладку"
                      title="Удалить закладку"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isEmpty && (
        <div className={styles.footer}>
          Показаны закладки графа «{title}». Всего: {items.length}
        </div>
      )}
    </div>
  );
};
