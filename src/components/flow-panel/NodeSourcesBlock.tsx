import { useMemo, useState } from "react";

import type { SourceGroup } from "../../utils/sourceRows";
import { CollapsibleBlock } from "./CollapsibleBlock";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DatabaseIcon,
  LinkIcon,
  SearchIcon,
} from "../icons";
import styles from "./NodeCard.module.css";

interface NodeSourcesBlockProps {
  /** Группы источников по всем продуктам графа. */
  groups: SourceGroup[];
  /** Продукт, чьи источники показываем. */
  product: string;
}

interface Row {
  id: string;
  product: string;
  direction: "up" | "down";
  title: string;
  url: string;
  inheritedFrom: string | null;
}

/** Домен вместо полного URL: в узкой колонке адрес целиком не читается. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Блок «Источники» в карточке узла: те источники, что найдены для этого
 * продукта (включая унаследованные от предка — с пометкой, от кого).
 */
export const NodeSourcesBlock = ({ groups, product }: NodeSourcesBlockProps) => {
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(() => {
    const mine = groups.filter((g) => g.product === product);
    const result: Row[] = [];
    for (const g of mine) {
      for (const s of g.sources) {
        result.push({
          id: `${g.id}::${s.url || s.title}`,
          product: g.product,
          direction: g.direction,
          title: s.title || hostOf(s.url),
          url: s.url,
          inheritedFrom: g.inheritedFrom,
        });
      }
    }
    return result;
  }, [groups, product]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <CollapsibleBlock
      title="Источники"
      count={rows.length}
      icon={<DatabaseIcon size={17} />}
      defaultOpen={rows.length > 0}
    >
      {rows.length === 0 ? (
        <div className={styles.blockEmpty}>
          Источников пока нет. Они появятся после поиска в окне построения шага.
        </div>
      ) : (
        <>
          <div className={styles.search}>
            <SearchIcon size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по источникам…"
            />
          </div>

          {filtered.length === 0 ? (
            <div className={styles.blockEmpty}>Ничего не найдено.</div>
          ) : (
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colDirection} />
                <col className={styles.colTitle} />
                <col className={styles.colLink} />
              </colgroup>
              <thead>
                <tr>
                  <th>Направление</th>
                  <th>Название</th>
                  <th>Ссылка</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span
                        className={`${styles.dirBadge} ${
                          row.direction === "up" ? styles.dirUp : styles.dirDown
                        }`}
                      >
                        {row.direction === "up" ? (
                          <ArrowUpIcon size={11} />
                        ) : (
                          <ArrowDownIcon size={11} />
                        )}
                        {row.direction === "up" ? "вверх" : "вниз"}
                      </span>
                    </td>
                    <td className={styles.titleCell}>
                      {row.title}
                      {row.inheritedFrom && (
                        <span className={styles.inherited}>
                          от «{row.inheritedFrom}»
                        </span>
                      )}
                    </td>
                    <td>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.link}
                        title={row.url}
                      >
                        <span className={styles.linkText}>{hostOf(row.url)}</span>
                        <LinkIcon size={13} className={styles.linkIcon} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </CollapsibleBlock>
  );
};
