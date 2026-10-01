import { useEffect, useMemo, useRef, useState, type FC } from "react";

import {
  fetchLocalProductSources,
  sourceHref,
  type LocalProduct,
  type LocalProductSection,
  type LocalProductSources,
} from "../../store/api/local-sources-api";
import type { TechnologySource } from "../../store/types";
import { LOCAL_ROLE_TEXT, sourceLinkText } from "../../utils/sourceOrigin";
import { plural } from "../../utils/plural";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilePdfIcon,
  LinkIcon,
  SearchIcon,
} from "../icons";
import industry from "../industry/Industry.module.css";
import { DetailsToggle } from "./DetailsToggle";
import type { PanelDetailsSlot } from "./usePanelDetails";
import detailsCss from "./PanelDetails.module.css";
import styles from "./LocalDocuments.module.css";

type Scope = "all" | "graph";

/** Источники раскрытого продукта — с версией базы, при которой получены. */
interface Loaded {
  version: string;
  data?: LocalProductSources;
  error?: string;
}

const DIRECTIONS = [
  {
    dir: "up" as const,
    Icon: ArrowUpIcon,
    title: "Вверх — как его получают",
    none: "В базе нет разделов, где его получают.",
  },
  {
    dir: "down" as const,
    Icon: ArrowDownIcon,
    title: "Вниз — что из него получают",
    none: "В базе нет разделов, где он сырьё.",
  },
];

function formatDate(iso?: string): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("ru-RU") : "";
}

const SectionItem: FC<{ s: LocalProductSection }> = ({ s }) => (
  <li className={styles.psItem}>
    <div className={styles.psHead}>
      <a
        className={styles.psTitle}
        href={sourceHref(s.url)}
        target="_blank"
        rel="noreferrer"
        title="Открыть документ на этом разделе"
      >
        {s.title}
      </a>
      <span className={`${styles.psRole} ${styles[`psRole_${s.role}`] ?? ""}`}>
        {LOCAL_ROLE_TEXT[s.role]}
      </span>
    </div>
    <div className={styles.psMeta}>
      <FilePdfIcon size={12} className={styles.psMetaIcon} />
      {s.docTitle} · {s.pages}
      {s.prospective && (
        <span
          className={styles.psPending}
          title="Процесс ещё не освоен промышленностью: в построении шага пойдёт альтернативой"
        >
          {" "}
          · перспективная технология
        </span>
      )}
      {!s.byModel && (
        <span className={styles.psPending}> · по заголовку — модель ещё не разобрала</span>
      )}
    </div>
    {s.summary && (
      <details className={styles.psDetails}>
        <summary>Описание от модели</summary>
        <p>{s.summary}</p>
      </details>
    )}
  </li>
);

const WebItem: FC<{ s: TechnologySource; label: string }> = ({ s, label }) => {
  const found = formatDate(s.savedAt);
  // Искали под другим именем продукта графа («ИПБ» у «Кумола»).
  const asked = s.product && s.product.toLowerCase() !== label.toLowerCase() ? s.product : null;
  return (
    <li className={styles.psItem}>
      <div className={styles.psHead}>
        <a className={styles.psTitle} href={s.url} target="_blank" rel="noreferrer">
          {s.title || sourceLinkText(s.url)}
        </a>
        <span className={`${styles.psRole} ${styles.psRole_web}`}>из интернета</span>
      </div>
      <div className={styles.psMeta}>
        <LinkIcon size={12} className={styles.psMetaIcon} />
        {sourceLinkText(s.url)}
        {found && ` · найдено ${found}`}
        {asked && ` для «${asked}»`}
      </div>
      {s.technology_description && (
        <details className={styles.psDetails}>
          <summary>Что в источнике</summary>
          <p>{s.technology_description}</p>
        </details>
      )}
    </li>
  );
};

/** Источники раскрытого продукта: вверх и вниз, разделы и найденное в сети. */
const ProductSources: FC<{ product: LocalProduct; loaded?: Loaded }> = ({
  product,
  loaded,
}) => {
  if (!loaded?.data) {
    return (
      <div className={styles.psNote}>
        {loaded?.error ?? "Загружаем источники…"}
      </div>
    );
  }
  const { data } = loaded;
  return (
    <div className={styles.psBody}>
      {DIRECTIONS.map(({ dir, Icon, title, none }) => {
        const sections = data[dir];
        const web = data.web[dir];
        const n = sections.length + web.length;
        return (
          <div key={dir} className={styles.psGroup}>
            <div className={styles.psGroupHead}>
              <Icon size={13} className={styles.psGroupIcon} />
              {title}
              <span className={styles.psCount}>{n}</span>
            </div>
            {n ? (
              <ul className={styles.psList}>
                {sections.map((s) => (
                  <SectionItem key={`s${s.sectionId}`} s={s} />
                ))}
                {web.map((s) => (
                  <WebItem key={`w${s.url}`} s={s} label={product.label} />
                ))}
              </ul>
            ) : (
              <div className={styles.psNone}>{none}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface Props {
  /** null — ещё не получены. */
  products: LocalProduct[] | null;
  /** Сколько продуктов — только промежуточные потоки: в список не входят. */
  hiddenIntermediates: number;
  error: string | null;
  /** Слепок базы: сменился — раскрытые источники запросить заново. */
  version: string;
  /** Документов в базе: нет — объясняем, откуда берутся продукты. */
  documents: number;
  /** Разделов в разборе: список ещё пополняется. */
  decoding: number;
  onOpenDocuments: () => void;
  /** Сводка вкладки: чипы и «Продукты / Документы» — по кнопке у поиска. */
  details: PanelDetailsSlot;
}

/**
 * Продукты базы источников — как «Промышленное знание»: вложенный список,
 * продукт → его источники.
 *
 * Продукт — вещество, которое разделы документов получают или берут сырьём
 * (разные написания сведены сервером). Под ним по щелчку — источники:
 * «вверх» — разделы, где его получают, «вниз» — где он сырьё, и то, что
 * модель находила в интернете. Отбор «На графе» оставляет продукты текущего
 * графа.
 */
export const LocalProductsList: FC<Props> = ({
  products,
  hiddenIntermediates,
  error,
  version,
  documents,
  decoding,
  onOpenDocuments,
  details,
}) => {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});

  const all = useMemo(() => products ?? [], [products]);
  const onGraph = useMemo(() => all.filter((p) => p.onGraph.length > 0), [all]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (scope === "graph" ? onGraph : all).filter(
      (p) =>
        !q ||
        p.label.toLowerCase().includes(q) ||
        p.names.some((n) => n.toLowerCase().includes(q)) ||
        p.onGraph.some((n) => n.toLowerCase().includes(q)),
    );
  }, [all, onGraph, scope, query]);

  const paged = usePaged(shown);
  // Нашёлся один — раскрыт сразу: ради его источников и искали. Щелчок
  // переключает наперекор этому правилу (open — продукты, где его нарушили).
  const autoOpen = shown.length === 1;
  const isOpen = (id: string) => autoOpen !== open.has(id);
  const allOpen = paged.slice.length > 0 && paged.slice.every((p) => isOpen(p.id));
  const setAll = (value: boolean) =>
    setOpen(new Set(autoOpen === value ? [] : paged.slice.map((p) => p.id)));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Сменились отборы — список с начала, раскрытое вручную забываем.
  const listRef = useRef<HTMLUListElement>(null);
  const filterSig = `${scope}\u0001${query.trim()}`;
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setOpen(new Set());
  }, [filterSig]);

  // Источники раскрытых продуктов: по запросу на продукт, заново — когда
  // база изменилась (загрузили документ, модель разобрала ещё раздел).
  const wanted = paged.slice.filter((p) => isOpen(p.id) && loaded[p.id]?.version !== version);
  const wantedKey = wanted.map((p) => p.id).join("|");
  useEffect(() => {
    if (!wanted.length) return;
    let cancelled = false;
    for (const p of wanted) {
      fetchLocalProductSources(p.keys)
        .then((data) => {
          if (!cancelled) setLoaded((prev) => ({ ...prev, [p.id]: { version, data } }));
        })
        .catch((e: Error) => {
          if (!cancelled) {
            setLoaded((prev) => ({ ...prev, [p.id]: { version, error: e.message } }));
          }
        });
    }
    return () => {
      cancelled = true;
    };
    // wantedKey — слепок набора: сам массив пересоздаётся на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, version]);

  if (products === null) {
    return <div className={industry.emptyRows}>{error ?? "Загружаем продукты…"}</div>;
  }

  if (!all.length) {
    return (
      <>
        {/* Искать нечего, а сводка с переключателем видов нужна и здесь. */}
        <div className={detailsCss.searchRow}>
          <span className={detailsCss.spacer} />
          <DetailsToggle open={details.open} onToggle={details.toggle} />
        </div>
        {details.open && <div className={detailsCss.details}>{details.content}</div>}
        <div className={industry.empty}>
          <div className={industry.emptyTitle}>
            {documents ? "Продуктов пока нет" : "В базе пока нет документов"}
          </div>
          <p className={industry.emptyText}>
            {documents
              ? decoding
                ? `Модель разбирает разделы (осталось ${decoding}) — продукты появятся по ходу разбора.`
                : "В разделах документов не нашлось веществ, которые получают или берут сырьём."
              : "Загрузите PDF: сервер разделит документ на разделы, модель разберёт каждый — что производят и из какого сырья, — и вещества появятся здесь с источниками."}
          </p>
          {/* Переключатель видов спрятан в сводке — дорога к документам здесь. */}
          <button type="button" className={industry.checkBtn} onClick={onOpenDocuments}>
            К документам
          </button>
        </div>
      </>
    );
  }

  const filtered = Boolean(query.trim()) || scope !== "all";

  return (
    <>
      <div className={detailsCss.searchRow}>
        <label className={industry.search}>
          <SearchIcon size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по продукту…"
          />
        </label>
        <DetailsToggle open={details.open} onToggle={details.toggle} active={scope !== "all"} />
      </div>

      {details.open && (
        <div className={detailsCss.details}>
          {details.content}
          <div className={`${industry.segmented} ${styles.baseViews}`}>
            {(
              [
                ["all", `Вся база (${all.length})`],
                ["graph", `На графе (${onGraph.length})`],
              ] as Array<[Scope, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${industry.segment} ${scope === value ? industry.segmentActive : ""}`}
                onClick={() => setScope(value)}
                aria-pressed={scope === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {decoding > 0 && (
        <p className={industry.note}>
          Модель разбирает разделы (осталось {decoding}) — список пополняется.
        </p>
      )}

      {/* Без сводки — только когда что-то отобрано: «Найдено» и сброс. */}
      {shown.length > 0 && (details.open || filtered) && (
        <div className={industry.listBar}>
          <span className={industry.listBarText}>
            {filtered
              ? `Найдено: ${shown.length} ${plural(shown.length, "продукт", "продукта", "продуктов")}`
              : null}
          </span>
          <span className={industry.listBarActions}>
            {filtered && (
              <button
                type="button"
                className={industry.linkBtn}
                onClick={() => {
                  setQuery("");
                  setScope("all");
                }}
              >
                Сбросить отборы
              </button>
            )}
            <button
              type="button"
              className={industry.linkBtn}
              onClick={() => setAll(!allOpen)}
            >
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </button>
          </span>
        </div>
      )}

      <ul ref={listRef} className={`${industry.groups} ${industry.cardsScroll}`}>
        {paged.slice.map((p) => {
          const expanded = isOpen(p.id);
          const up = p.up + p.web.up;
          const down = p.down + p.web.down;
          // На графе продукт может называться иначе («Кумол» — «ИПБ»).
          const alias = p.onGraph.filter((n) => n.toLowerCase() !== p.label.toLowerCase());
          return (
            <li key={p.id} className={industry.group}>
              <button
                type="button"
                className={industry.groupHead}
                onClick={() => toggle(p.id)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                <span className={industry.groupTitle}>
                  <span className={industry.groupName}>
                    {p.label}
                    {p.onGraph.length > 0 && " "}
                    {p.onGraph.length > 0 && (
                      <span
                        className={styles.onGraph}
                        title={`Узел графа: ${p.onGraph.join(", ")}`}
                      >
                        {alias.length ? `на графе: ${alias.join(", ")}` : "на графе"}
                      </span>
                    )}
                  </span>
                  {p.names.length > 0 && (
                    <span className={industry.groupClass}>также: {p.names.join(", ")}</span>
                  )}
                </span>
                <span
                  className={`${industry.groupCount} ${styles.dirCounts}`}
                  title={
                    `Вверх — как его получают: ${p.up} ${plural(p.up, "раздел", "раздела", "разделов")}` +
                    (p.web.up ? `, из интернета ${p.web.up}` : "") +
                    `\nВниз — что из него получают: ${p.down} ${plural(p.down, "раздел", "раздела", "разделов")}` +
                    (p.web.down ? `, из интернета ${p.web.down}` : "")
                  }
                >
                  <span className={up ? undefined : styles.dirZero}>
                    <ArrowUpIcon size={11} /> {up}
                  </span>
                  <span className={down ? undefined : styles.dirZero}>
                    <ArrowDownIcon size={11} /> {down}
                  </span>
                </span>
              </button>
              {expanded && (
                <div className={industry.groupBody}>
                  <ProductSources product={p} loaded={loaded[p.id]} />
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className={industry.emptyRows}>
            {scope === "graph" && !onGraph.length
              ? "Ни одного продукта графа в базе нет."
              : "По этому запросу ничего нет."}{" "}
            <button
              type="button"
              className={industry.linkBtn}
              onClick={() => {
                setQuery("");
                setScope("all");
              }}
            >
              Сбросить отборы
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
        unit="продуктов"
      />

      {details.open && (
        <p className={industry.foot}>
          Написания одного вещества («Пропилен», «Пропен») сведены в строку.
          {hiddenIntermediates > 0 &&
            ` Промежуточных потоков («контактный газ», «сырец») — ${hiddenIntermediates}: они у разделов в «Документах».`}
        </p>
      )}
    </>
  );
};
