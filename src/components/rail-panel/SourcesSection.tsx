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
  DatabaseIcon,
  FlaskIcon,
  GearIcon,
  LinkIcon,
  SearchIcon,
} from "../icons";
import styles from "./PanelSection.module.css";

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
  const [query, setQuery] = useState("");

  const { data, sourcesPool, originalPrompt } = useAppSelector((s) => s.graph);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const title = graphName || originalPrompt || "без названия";

  const summary = useMemo(
    () => collectGraphSources(data.nodes, sourcesPool, sourcesPoolKey),
    [data.nodes, sourcesPool],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summary.rows;
    return summary.rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.objectLabel.toLowerCase().includes(q),
    );
  }, [summary.rows, query]);

  const isEmpty = summary.rows.length === 0;

  return (
    <div className={styles.section}>
      <div className={styles.summaryCard}>
        <DatabaseIcon size={20} className={styles.summaryIcon} />
        <span className={styles.summaryValue}>{summary.total}</span>
        <span className={styles.summaryLabel}>
          {summary.total === 1 ? "источник в графе" : "источников в графе"}
        </span>
      </div>

      <div className={styles.search}>
        <SearchIcon size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по источникам…"
        />
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          Источники появятся после их поиска в карточке продукта — здесь
          соберутся все, что использовались при построении графа.
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Ничего не найдено.</div>
      ) : (
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
      )}

      {!isEmpty && (
        <div className={styles.footer}>
          Показаны источники графа «{title}». Всего: {summary.total}
        </div>
      )}
    </div>
  );
};
