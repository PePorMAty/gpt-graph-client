import { useCallback, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  removeBookmark,
  setBookmarkNote,
  type Bookmark,
} from "../../store/slices/bookmarksSlice";
import { useFocusNode } from "../../hooks/useFocusNode";
import { useDismiss } from "../../hooks/useDismiss";
import {
  BookmarkIcon,
  ChevronDownIcon,
  ClockIcon,
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

/** Порядок закладок — как в библиотеке графов: по дате или по названию. */
type SortMode = "new" | "old" | "name";

const SORT_LABEL: Record<SortMode, string> = {
  new: "Сначала новые",
  old: "Сначала старые",
  name: "По названию",
};

const SORT_KEY = "bookmarks-sort";

/** Выбранный порядок переживает перезагрузку, как в библиотеке. */
function readSort(): SortMode {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (raw === "new" || raw === "old" || raw === "name") return raw;
  } catch {
    // Хранилище недоступно — берём порядок по умолчанию.
  }
  return "new";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Раздел «Закладки»: узлы, которые пользователь отметил правым кликом на
 * полотне. Клик по названию подводит камеру и выделяет узел, карандаш правит
 * заметку.
 *
 * Закладки привязаны к id узлов текущего графа — смена графа их сбрасывает. У
 * сохранённого графа они хранятся на сервере и переживают перезагрузку
 * вкладки; у ещё не сохранённого — живут в памяти (см. bookmarksSlice).
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
  const [sort, setSort] = useState<SortMode>(readSort);
  const [sortOpen, setSortOpen] = useState(false);
  // Меню закрываются и щелчком мимо, а не только выбором пункта.
  const kindRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const closeKind = useCallback(() => setKindOpen(false), []);
  const closeSort = useCallback(() => setSortOpen(false), []);
  useDismiss(kindRef, closeKind, kindOpen);
  useDismiss(sortRef, closeSort, sortOpen);

  const changeSort = (mode: SortMode) => {
    setSort(mode);
    setSortOpen(false);
    try {
      localStorage.setItem(SORT_KEY, mode);
    } catch {
      // Не сохранится — порядок просто сбросится при перезагрузке.
    }
  };
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
    const list = items.filter((b) => {
      if (kind !== "all" && b.kind !== kind) return false;
      if (!q) return true;
      return (
        b.label.toLowerCase().includes(q) || b.note.toLowerCase().includes(q)
      );
    });
    if (sort === "name") {
      return list.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    }
    // Дата — строка ISO: сравнивается как строка. У закладок одного момента
    // порядок сохраняется прежний (сортировка устойчивая).
    return list.sort((a, b) => {
      const d = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      return sort === "new" ? -d : d;
    });
  }, [items, query, kind, sort]);

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

        <div className={styles.filterRow}>
          <div className={styles.filter} ref={kindRef}>
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

          <div className={styles.filter} ref={sortRef}>
            <button
              type="button"
              className={styles.filterBtn}
              onClick={() => setSortOpen((v) => !v)}
              aria-expanded={sortOpen}
              aria-label={`Порядок: ${SORT_LABEL[sort]}`}
            >
              <ClockIcon size={15} className={styles.filterIcon} />
              {SORT_LABEL[sort]}
              <ChevronDownIcon size={14} className={styles.filterCaret} />
            </button>
            {sortOpen && (
              <div className={styles.filterMenu}>
                {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.filterItem} ${
                      sort === mode ? styles.filterItemActive : ""
                    }`}
                    onClick={() => changeSort(mode)}
                  >
                    {SORT_LABEL[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>
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
                      <span className={styles.objectText}>
                        <span className={styles.objectLinkLabel}>{b.label}</span>
                        {/* Когда поставлена — по ней закладки и сортируются. */}
                        {formatDate(b.createdAt) && (
                          <span className={styles.objectDate}>
                            {formatDate(b.createdAt)}
                          </span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td>
                    <span
                      title={
                        b.kind === "product" ? "Продукт" : "Преобразование"
                      }
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
