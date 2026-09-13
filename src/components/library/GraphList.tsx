import { useCallback, useMemo, useRef, useState } from "react";

import type { SavedGraphMeta } from "../../store/types";
import { useDismiss } from "../../hooks/useDismiss";
import { ChevronDownIcon, ExportIcon, FilterIcon, SearchIcon } from "../icons";
import styles from "./LibraryScreen.module.css";

/** Порядок в списке графов. Значения переживают перезагрузку (localStorage). */
export type SortMode = "updated" | "created" | "name";

const SORT_LABEL: Record<SortMode, string> = {
  updated: "Сначала изменённые",
  created: "Сначала новые",
  name: "По названию",
};

interface GraphListProps {
  items: SavedGraphMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (graph: SavedGraphMeta) => void;
  onDelete: (graph: SavedGraphMeta) => void;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  isLoading?: boolean;
  /** Загрузка графа из JSON-файла на полотно. */
  onUploadFile: (file: File) => void;
  uploading?: boolean;
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

/** Меню строки списка: переименовать и удалить. */
const RowMenu = ({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, close, open);

  return (
    <div className={styles.rowMenuWrap} ref={ref}>
      <button
        type="button"
        className={styles.rowMenuBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Действия с графом"
      >
        ⋮
      </button>
      {open && (
        <div className={styles.rowMenu}>
          <button
            type="button"
            className={styles.rowMenuItem}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            Переименовать
          </button>
          <button
            type="button"
            className={`${styles.rowMenuItem} ${styles.rowMenuItemDanger}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            Удалить
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Левая колонка библиотеки: список сохранённых графов с поиском и сортировкой.
 * Выбор графа открывает его карточку справа, а не полотно.
 */
export const GraphList = ({
  items,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  sort,
  onSortChange,
  isLoading = false,
  onUploadFile,
  uploading = false,
}: GraphListProps) => {
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const closeSort = useCallback(() => setSortOpen(false), []);
  useDismiss(sortRef, closeSort, sortOpen);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((g) => g.name.toLowerCase().includes(q))
      : items;
    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    } else if (sort === "created") {
      sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } else {
      sorted.sort((a, b) => {
        const at = a.updatedAt || a.createdAt;
        const bt = b.updatedAt || b.createdAt;
        return at < bt ? 1 : -1;
      });
    }
    return sorted;
  }, [items, query, sort]);

  return (
    <aside className={styles.list}>
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>Мои графы</h2>

        <div className={styles.rowMenuWrap} ref={sortRef}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setSortOpen((v) => !v)}
            aria-expanded={sortOpen}
          >
            <FilterIcon size={15} />
            Фильтр
            <ChevronDownIcon size={14} />
          </button>
          {sortOpen && (
            <div className={styles.rowMenu}>
              {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${styles.rowMenuItem} ${
                    sort === mode ? styles.rowMenuItemActive : ""
                  }`}
                  onClick={() => {
                    onSortChange(mode);
                    setSortOpen(false);
                  }}
                >
                  {SORT_LABEL[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUploadFile(file);
        }}
      />

      <div className={styles.listSearch}>
        <SearchIcon size={15} className={styles.listSearchIcon} />
        <input
          className={styles.listSearchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по графам…"
        />
      </div>

      <div className={styles.listBody}>
        {isLoading && items.length === 0 ? (
          <div className={styles.listEmpty}>Загружаю список…</div>
        ) : visible.length === 0 ? (
          <div className={styles.listEmpty}>
            {items.length === 0
              ? "Сохранённых графов пока нет."
              : "Ничего не найдено."}
          </div>
        ) : (
          <ul className={styles.listItems}>
            {visible.map((g) => (
              <li key={g.id}>
                <div
                  className={`${styles.row} ${
                    g.id === selectedId ? styles.rowActive : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(g.id);
                    }
                  }}
                >
                  <div className={styles.rowText}>
                    <div className={styles.rowName}>{g.name}</div>
                    <div className={styles.rowDate}>
                      Обновлён {formatDate(g.updatedAt || g.createdAt)}
                    </div>
                  </div>
                  <RowMenu
                    onRename={() => onRename(g)}
                    onDelete={() => onDelete(g)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.listFooter}>
        <span>
          Сохранённых графов: <b>{items.length}</b>
        </span>
        {/* Загрузка графа из файла: в макете кнопки нет, но функция была во
            вкладке «Объединить графы» и без неё терялась бы совсем. */}
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ExportIcon size={15} className={styles.uploadIcon} />
          {uploading ? "Загружаю…" : "Загрузить из файла"}
        </button>
      </div>
    </aside>
  );
};
