import { useEffect, useMemo, useRef, useState, type FC } from "react";

import { sourceHref } from "../../store/api/local-sources-api";
import type { GraphSourceRow, GraphSourcesSummary } from "../../utils/graphSources";
import { plural } from "../../utils/plural";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FilePdfIcon,
  FlaskIcon,
  GearIcon,
  LinkIcon,
  SearchIcon,
} from "../icons";
import industry from "../industry/Industry.module.css";
import { DetailsToggle } from "./DetailsToggle";
import { usePanelDetails } from "./usePanelDetails";
import details from "./PanelDetails.module.css";
import styles from "./LocalDocuments.module.css";

/** Объект графа и его источники. */
interface Group {
  key: string;
  label: string;
  kind: GraphSourceRow["objectKind"];
  up: GraphSourceRow[];
  down: GraphSourceRow[];
  /** Источники преобразования — без направления. */
  plain: GraphSourceRow[];
}

const DIRECTIONS = [
  { dir: "up" as const, Icon: ArrowUpIcon, title: "Вверх — как его получают" },
  { dir: "down" as const, Icon: ArrowDownIcon, title: "Вниз — что из него получают" },
];

const SourceItem: FC<{ row: GraphSourceRow }> = ({ row }) => (
  <li className={styles.psItem}>
    <div className={styles.psHead}>
      <a
        className={styles.psTitle}
        href={sourceHref(row.url)}
        target="_blank"
        rel="noreferrer"
        title={row.local ? "Открыть документ на этом разделе" : row.url}
      >
        {row.title}
      </a>
      {row.saved && !row.local && (
        <span
          className={`${styles.psRole} ${styles.psRole_web}`}
          title="Найден моделью раньше и взят из базы источников"
        >
          из базы
        </span>
      )}
    </div>
    <div className={styles.psMeta}>
      {row.local ? (
        <FilePdfIcon size={12} className={styles.psMetaIcon} />
      ) : (
        <LinkIcon size={12} className={styles.psMetaIcon} />
      )}
      {row.tag}
      {row.inheritedFrom && ` · взят у «${row.inheritedFrom}»`}
    </div>
  </li>
);

interface Props {
  summary: GraphSourcesSummary;
  /** Название графа — для подвала. */
  graphTitle?: string;
  /** Пустой граф без источников — что сказать. */
  emptyText?: string;
  /**
   * Боковая панель: над списком только поиск, сводка и отборы — по кнопке
   * рядом с ним (usePanelDetails). В библиотеке места хватает — там всё видно.
   */
  collapsible?: boolean;
}

/**
 * Источники графа вложенным списком, как «База источников» и «Промышленное
 * знание»: объект графа → его источники.
 *
 * Плоская таблица «объект — направление — источник» повторяла объект в
 * каждой строке, и у продукта с десятком источников его было не собрать в
 * одно место. Здесь продукт — строка, под ней по щелчку источники «вверх» и
 * «вниз»; у преобразования — просто его источники.
 */
export const GraphSourcesList: FC<Props> = ({
  summary,
  graphTitle,
  emptyText = "Источники появятся после их поиска в окне построения шага — здесь соберутся все, что использовались при построении графа.",
  collapsible = false,
}) => {
  const [detailsOpen, toggleDetails] = usePanelDetails();
  const showDetails = !collapsible || detailsOpen;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // Объекты графа по алфавиту, у каждого — его источники.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const row of summary.rows) {
      const key = `${row.objectKind}\u0001${row.objectLabel}`;
      let g = map.get(key);
      if (!g) {
        g = { key, label: row.objectLabel, kind: row.objectKind, up: [], down: [], plain: [] };
        map.set(key, g);
      }
      if (row.direction === "up") g.up.push(row);
      else if (row.direction === "down") g.down.push(row);
      else g.plain.push(row);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [summary.rows]);

  const counts = useMemo(
    () => ({
      product: groups.filter((g) => g.kind === "product").length,
      transformation: groups.filter((g) => g.kind === "transformation").length,
    }),
    [groups],
  );

  // Поиск — по объекту и по источникам: найденный по источнику объект
  // остаётся с одними подходящими источниками.
  const shown = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const hit = (r: GraphSourceRow) =>
      r.title.toLowerCase().includes(q) ||
      r.url.toLowerCase().includes(q) ||
      r.tag.toLowerCase().includes(q);
    const out: Group[] = [];
    for (const g of groups) {
      if (!q || g.label.toLowerCase().includes(q)) {
        out.push(g);
        continue;
      }
      const narrowed = { ...g, up: g.up.filter(hit), down: g.down.filter(hit), plain: g.plain.filter(hit) };
      if (narrowed.up.length + narrowed.down.length + narrowed.plain.length) out.push(narrowed);
    }
    return out;
  }, [groups, query]);

  const paged = usePaged(shown);
  // Нашёлся один — раскрыт сразу; щелчок переключает наперекор правилу.
  const autoOpen = shown.length === 1;
  const isOpen = (key: string) => autoOpen !== open.has(key);
  const allOpen = paged.slice.length > 0 && paged.slice.every((g) => isOpen(g.key));
  const setAll = (value: boolean) =>
    setOpen(new Set(autoOpen === value ? [] : paged.slice.map((g) => g.key)));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Отбора по виду объекта нет: источники ищутся у продуктов, а у
  // преобразования они бывают, только если его нашла «Получить
  // преобразование», — отбор почти всегда делил список на всё и ничего.
  const filtered = Boolean(query.trim());
  const listRef = useRef<HTMLUListElement>(null);
  const filterSig = query.trim();
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setOpen(new Set());
  }, [filterSig]);

  if (!summary.rows.length) {
    return (
      <div className={industry.empty}>
        <DatabaseIcon size={30} className={industry.emptyIcon} />
        <div className={industry.emptyTitle}>Источников пока нет</div>
        <p className={industry.emptyText}>{emptyText}</p>
      </div>
    );
  }

  const chips = (
    <div className={industry.chips}>
      <span className={industry.chip}>
        <DatabaseIcon size={13} />
        {summary.total} {plural(summary.total, "источник", "источника", "источников")}
      </span>
      <span className={industry.chip}>
        <FlaskIcon size={13} />
        {counts.product} {plural(counts.product, "продукт", "продукта", "продуктов")}
      </span>
      {counts.transformation > 0 && (
        <span className={industry.chip}>
          <GearIcon size={13} />
          {counts.transformation}{" "}
          {plural(counts.transformation, "преобразование", "преобразования", "преобразований")}
        </span>
      )}
    </div>
  );

  const search = (
    <label className={industry.search}>
      <SearchIcon size={14} />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по объекту или источнику…"
      />
    </label>
  );

  return (
    <div className={`${industry.wrap} ${industry.wrapPanel}`}>
      {collapsible ? (
        <>
          <div className={details.searchRow}>
            {search}
            <DetailsToggle open={detailsOpen} onToggle={toggleDetails} />
          </div>
          {detailsOpen && <div className={details.details}>{chips}</div>}
        </>
      ) : (
        <>
          {chips}
          <div className={industry.filters}>{search}</div>
        </>
      )}

      {/* Без сводки — только когда что-то отобрано: «Найдено» и сброс. */}
      {shown.length > 0 && (showDetails || filtered) && (
        <div className={industry.listBar}>
          <span className={industry.listBarText}>
            {filtered
              ? `Найдено: ${shown.length} ${plural(shown.length, "объект", "объекта", "объектов")}`
              : null}
          </span>
          <span className={industry.listBarActions}>
            {filtered && (
              <button
                type="button"
                className={industry.linkBtn}
                onClick={() => setQuery("")}
              >
                Сбросить поиск
              </button>
            )}
            <button type="button" className={industry.linkBtn} onClick={() => setAll(!allOpen)}>
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </button>
          </span>
        </div>
      )}

      <ul ref={listRef} className={`${industry.groups} ${industry.cardsScroll}`}>
        {paged.slice.map((g) => {
          const expanded = isOpen(g.key);
          const total = g.up.length + g.down.length + g.plain.length;
          return (
            <li key={g.key} className={industry.group}>
              <button
                type="button"
                className={industry.groupHead}
                onClick={() => toggle(g.key)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                <span className={industry.groupTitle}>
                  <span className={`${industry.groupName} ${styles.objectName}`}>
                    {g.kind === "product" ? (
                      <FlaskIcon size={13} className={styles.objectIconProduct} />
                    ) : (
                      <GearIcon size={13} className={styles.objectIconTransform} />
                    )}
                    {g.label}
                  </span>
                </span>
                {g.kind === "product" ? (
                  <span
                    className={`${industry.groupCount} ${styles.dirCounts}`}
                    title={`Вверх — как его получают: ${g.up.length}\nВниз — что из него получают: ${g.down.length}`}
                  >
                    <span className={g.up.length ? undefined : styles.dirZero}>
                      <ArrowUpIcon size={11} /> {g.up.length}
                    </span>
                    <span className={g.down.length ? undefined : styles.dirZero}>
                      <ArrowDownIcon size={11} /> {g.down.length}
                    </span>
                  </span>
                ) : (
                  <span className={industry.groupCount}>
                    {total} {plural(total, "источник", "источника", "источников")}
                  </span>
                )}
              </button>
              {expanded && (
                <div className={industry.groupBody}>
                  <div className={styles.psBody}>
                    {g.kind === "product" ? (
                      DIRECTIONS.map(({ dir, Icon, title }) => {
                        const rows = g[dir];
                        return (
                          <div key={dir} className={styles.psGroup}>
                            <div className={styles.psGroupHead}>
                              <Icon size={13} className={styles.psGroupIcon} />
                              {title}
                              <span className={styles.psCount}>{rows.length}</span>
                            </div>
                            {rows.length ? (
                              <ul className={styles.psList}>
                                {rows.map((r) => (
                                  <SourceItem key={r.id} row={r} />
                                ))}
                              </ul>
                            ) : (
                              <div className={styles.psNone}>
                                Источников в эту сторону не искали.
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <ul className={styles.psList}>
                        {g.plain.map((r) => (
                          <SourceItem key={r.id} row={r} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className={industry.emptyRows}>
            По этому запросу ничего нет.{" "}
            <button
              type="button"
              className={industry.linkBtn}
              onClick={() => setQuery("")}
            >
              Сбросить поиск
            </button>
          </li>
        )}
      </ul>

      <Pagination
        page={paged.page}
        pages={paged.pages}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onChange={paged.setPage}
        unit="объектов"
      />

      {graphTitle && showDetails && (
        <p className={industry.foot}>
          Источники графа «{graphTitle}». Унаследованные от продукта выше по
          цепочке помечены «взят у …» и в общее число не входят.
        </p>
      )}
    </div>
  );
};
