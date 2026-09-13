import { useMemo, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { sourcesPoolKey } from "../../store/slices/gptSlice";
import { collectSourceGroups } from "../../utils/sourceRows";
import type { RailSection } from "../left-rail/LeftRail";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkIcon,
  ClockIcon,
  CloseIcon,
  SearchIcon,
} from "../icons";
import styles from "./RailPanel.module.css";

interface RailPanelProps {
  section: RailSection;
  onClose: () => void;
}

/** Таблица источников текущего графа — раздел «База данных». */
const SourcesSection = () => {
  const [query, setQuery] = useState("");
  const { data, sourcesPool } = useAppSelector((s) => s.graph);

  const groups = useMemo(() => {
    const labels = data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label ?? ""))
      .filter(Boolean);
    return collectSourceGroups([...new Set(labels)], sourcesPool, sourcesPoolKey);
  }, [data.nodes, sourcesPool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        sources: g.sources.filter(
          (s) =>
            s.title.toLowerCase().includes(q) || s.url.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.product.toLowerCase().includes(q) || g.sources.length > 0);
  }, [groups, query]);

  const total = useMemo(
    () => groups.reduce((n, g) => n + (g.inheritedFrom ? 0 : g.sources.length), 0),
    [groups],
  );

  return (
    <>
      <div className={styles.search}>
        <SearchIcon size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по продукту или источнику…"
        />
      </div>

      <div className={styles.meta}>
        Источников на графе: <b>{total}</b>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {groups.length === 0
            ? "Источники появятся после поиска в карточке продукта."
            : "Ничего не найдено."}
        </div>
      ) : (
        <ul className={styles.groups}>
          {filtered.map((g) => (
            <li key={g.id} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupProduct}>{g.product}</span>
                <span
                  className={`${styles.dirBadge} ${
                    g.direction === "up" ? styles.dirUp : styles.dirDown
                  }`}
                >
                  {g.direction === "up" ? (
                    <ArrowUpIcon size={11} />
                  ) : (
                    <ArrowDownIcon size={11} />
                  )}
                  {g.direction === "up" ? "вверх" : "вниз"}
                </span>
              </div>

              {g.inheritedFrom && (
                <div className={styles.inherited}>
                  Источники унаследованы от «{g.inheritedFrom}»
                </div>
              )}

              <ul className={styles.sources}>
                {g.sources.map((s) => (
                  <li key={s.url || s.title} className={styles.source}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.sourceTitle}
                      title={s.url}
                    >
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

const PLACEHOLDERS: Partial<
  Record<RailSection, { title: string; text: string; Icon: typeof ClockIcon }>
> = {
  bookmarks: {
    title: "Закладки",
    Icon: BookmarkIcon,
    text: "Здесь будут сохранённые узлы и участки графа, чтобы быстро к ним возвращаться. Раздел ещё не подключён.",
  },
  history: {
    title: "История",
    Icon: ClockIcon,
    text: "Здесь будет история действий: построенные шаги, удаления, проверки и отменённые операции. Раздел ещё не подключён.",
  },
};

const TITLES: Record<RailSection, string> = {
  create: "Создание графа",
  graph: "Граф",
  sources: "База данных",
  bookmarks: "Закладки",
  history: "История",
};

/**
 * Выезжающая панель разделов левого рельса. Поверх холста, но без затемнения:
 * граф остаётся доступным, панель закрывается крестиком или Escape.
 */
export const RailPanel = ({ section, onClose }: RailPanelProps) => {
  const placeholder = PLACEHOLDERS[section];

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{TITLES[section]}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Закрыть панель"
        >
          <CloseIcon size={17} />
        </button>
      </div>

      <div className={styles.body}>
        {section === "sources" && <SourcesSection />}
        {placeholder && (
          <div className={styles.placeholder}>
            <placeholder.Icon size={28} className={styles.placeholderIcon} />
            <div className={styles.placeholderText}>{placeholder.text}</div>
          </div>
        )}
      </div>
    </aside>
  );
};
