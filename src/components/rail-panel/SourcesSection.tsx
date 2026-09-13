import { useMemo, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import { sourcesPoolKey } from "../../store/slices/gptSlice";
import {
  collectGraphSources,
  type GraphSourceRow,
} from "../../utils/graphSources";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FilterIcon,
  FlaskIcon,
  GearIcon,
  LinkIcon,
  SearchIcon,
} from "../icons";
import styles from "./SourcesSection.module.css";

type Tab = "all" | "byObject";
type KindFilter = "all" | "product" | "transformation";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "Все типы источников",
  product: "Источники продуктов",
  transformation: "Источники превращений",
};

const DirectionBadge = ({ direction }: { direction: "up" | "down" | null }) => {
  if (!direction) return <span className={styles.dirEmpty}>—</span>;
  return (
    <span
      className={`${styles.dirBadge} ${
        direction === "up" ? styles.dirUp : styles.dirDown
      }`}
    >
      {direction === "up" ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />}
      {direction === "up" ? "вверх" : "вниз"}
    </span>
  );
};

const ObjectCell = ({ row }: { row: GraphSourceRow }) => (
  <span className={styles.object} title={row.objectLabel}>
    {row.objectKind === "product" ? (
      <FlaskIcon size={14} className={styles.objectIconProduct} />
    ) : (
      <GearIcon size={14} className={styles.objectIconTransform} />
    )}
    <span className={styles.objectLabel}>{row.objectLabel}</span>
  </span>
);

/** Домен вместо полного URL: в узкой колонке «https://…» ничего не сообщает. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const SourceLink = ({ url }: { url: string }) => (
  <a
    href={url}
    target="_blank"
    rel="noreferrer"
    className={styles.link}
    title={url}
  >
    <span className={styles.linkText}>{hostOf(url)}</span>
    <LinkIcon size={13} className={styles.linkIcon} />
  </a>
);

/**
 * Раздел «База данных»: все источники, использованные при построении текущего
 * графа. Источники продуктов приходят из пула поиска, источники превращений —
 * из ссылок на самих узлах-преобразованиях; здесь они сведены в один список.
 *
 * База ГИСП сюда ещё не подключена — появится отдельной группой.
 */
export const SourcesSection = () => {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [kindOpen, setKindOpen] = useState(false);

  const { data, sourcesPool, originalPrompt } = useAppSelector((s) => s.graph);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const title = graphName || originalPrompt || "без названия";

  const summary = useMemo(
    () => collectGraphSources(data.nodes, sourcesPool, sourcesPoolKey),
    [data.nodes, sourcesPool],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summary.rows.filter((r) => {
      if (kind !== "all" && r.objectKind !== kind) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.objectLabel.toLowerCase().includes(q)
      );
    });
  }, [summary.rows, query, kind]);

  // Группировка для вкладки «По объектам графа»: порядок групп — как в списке.
  const grouped = useMemo(() => {
    const map = new Map<string, GraphSourceRow[]>();
    for (const row of filtered) {
      const key = `${row.objectKind}::${row.objectLabel}`;
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return [...map.values()];
  }, [filtered]);

  const isEmpty = summary.rows.length === 0;

  return (
    <div className={styles.section}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "all" ? styles.tabActive : ""}`}
          onClick={() => setTab("all")}
        >
          Все источники ({summary.total})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "byObject" ? styles.tabActive : ""}`}
          onClick={() => setTab("byObject")}
        >
          По объектам графа
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <DatabaseIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{summary.total}</span>
          <span className={styles.statLabel}>Всего источников</span>
        </div>
        <div className={styles.stat}>
          <BookIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{summary.products}</span>
          <span className={styles.statLabel}>Источники продуктов</span>
        </div>
        <div className={styles.stat}>
          <GearIcon size={18} className={styles.statIcon} />
          <span className={styles.statValue}>{summary.transformations}</span>
          <span className={styles.statLabel}>Источники превращений</span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.search}>
          <SearchIcon size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по источникам…"
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
          Источники появятся после их поиска в карточке продукта — здесь
          соберутся все, что использовались при построении графа.
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Ничего не найдено.</div>
      ) : tab === "all" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.colObject} />
              <col className={styles.colDirection} />
              <col className={styles.colTitle} />
              <col className={styles.colLink} />
            </colgroup>
            <thead>
              <tr>
                <th>Объект графа</th>
                <th>Направление</th>
                <th>Название</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <ObjectCell row={row} />
                  </td>
                  <td>
                    <DirectionBadge direction={row.direction} />
                  </td>
                  <td className={styles.titleCell}>
                    {row.title}
                    {row.inheritedFrom && (
                      <span className={styles.inherited}>
                        от «{row.inheritedFrom}»
                      </span>
                    )}
                  </td>
                  <td className={styles.linkCell}>
                    <SourceLink url={row.url} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className={styles.groups}>
          {grouped.map((rows) => (
            <li key={rows[0].id} className={styles.group}>
              <div className={styles.groupHead}>
                <ObjectCell row={rows[0]} />
                <DirectionBadge direction={rows[0].direction} />
              </div>
              {rows[0].inheritedFrom && (
                <div className={styles.groupInherited}>
                  Источники унаследованы от «{rows[0].inheritedFrom}»
                </div>
              )}
              <ul className={styles.groupList}>
                {rows.map((row) => (
                  <li key={row.id} className={styles.groupItem}>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.groupLink}
                      title={row.url}
                    >
                      {row.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {!isEmpty && (
        <div className={styles.footer}>
          Показаны источники графа «{title}». Всего: {summary.total}
        </div>
      )}
    </div>
  );
};
