import { useEffect, useMemo, useRef, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import type { IndustryProducer } from "../../store/api/industry-api";
import { GISP_REGISTRY_URL } from "./gisp";
import {
  STATUS_FILTERS,
  matchesStatus,
  type StatusFilter,
} from "./statusFilter";
import { Pagination } from "../ui/Pagination";
import { usePaged } from "../ui/usePaged";
import {
  IndustryDataIcon,
  ShieldCheckIcon,
  SearchIcon,
  LinkIcon,
  PlantIcon,
  FlaskIcon,
  BookIcon,
  FocusIcon,
} from "../icons";
import styles from "./Industry.module.css";

/** Строка таблицы: запись реестра вместе с продуктом графа, по которому нашлась. */
interface Row extends IndustryProducer {
  /** Название узла графа — по нему шёл поиск. */
  source: string;
}

interface Props {
  /** Названия продуктов текущего графа. */
  productNames: string[];
  /**
   * Узкая раскладка для левой панели.
   *
   * В библиотеке под таблицу отдан весь экран, и шесть колонок читаются. В
   * рельсе ширины около 420 пикселей: там те же колонки уезжают за край вместе
   * со статусом и номером записи, поэтому запись показываем карточкой.
   */
  compact?: boolean;
}

/**
 * Промышленные данные по всему графу — вкладка библиотеки.
 *
 * Карточка отвечает на вопрос об одном продукте, а здесь нужен свод: сколько
 * продуктов графа подтверждено реестром, кто их выпускает и в каких регионах.
 * Поэтому таблица плоская — запись на строку, — с поиском и отборами: на
 * большом графе записей набираются сотни.
 */
export const IndustryGraphPanel: FC<Props> = ({ productNames, compact = false }) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );

  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("");
  const [region, setRegion] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /**
   * Что показываем: найденные записи реестра или продукты, которых там нет.
   *
   * Ненайденные не попадают в таблицу по устройству — записей у них ноль, —
   * а вопрос «чего в реестре нет» не менее важен: это либо непрофильная
   * продукция, либо название, под которым реестр её не знает.
   */
  const [view, setView] = useState<"entries" | "missing">("entries");

  const names = useMemo(
    () => [...new Set(productNames.map((n) => String(n ?? "").trim()).filter(Boolean))],
    [productNames],
  );

  /** Все записи реестра по продуктам графа, по одной на строку. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const name of names) {
      for (const p of results[industryKey(name)]?.producers ?? []) {
        out.push({ ...p, source: name });
      }
    }
    return out;
  }, [names, results]);

  const checked = names.filter((n) => results[industryKey(n)]).length;
  const confirmed = names.filter((n) => results[industryKey(n)]?.found).length;

  /** Проверенные продукты, которых в реестре не нашлось. */
  const missing = useMemo(
    () =>
      names.filter((n) => {
        const info = results[industryKey(n)];
        return info && !info.found;
      }),
    [names, results],
  );

  const missingVisible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? missing.filter((n) => n.toLowerCase().includes(q)) : missing;
  }, [missing, query]);

  const stats = useMemo(() => {
    const inns = new Set<string>();
    const regions = new Set<string>();
    for (const r of rows) {
      inns.add(r.inn ?? r.producer);
      if (r.region) regions.add(r.region);
    }
    return { producers: inns.size, regions: regions.size, entries: rows.length };
  }, [rows]);

  const regionOptions = useMemo(
    () => [...new Set(rows.map((r) => r.region).filter(Boolean))].sort() as string[],
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (product && r.source !== product) return false;
      if (region && r.region !== region) return false;
      if (!matchesStatus(r.status, statusFilter)) return false;
      if (!q) return true;
      return (
        r.producer.toLowerCase().includes(q) ||
        (r.producerFull ?? "").toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q) ||
        (r.inn ?? "").includes(q)
      );
    });
  }, [rows, query, product, region, statusFilter]);

  // Реестровых записей на большом графе набираются сотни.
  const paged = usePaged(visible);
  const pagedMissing = usePaged(missingVisible);
  const showMissing = view === "missing";
  const page = showMissing ? pagedMissing : paged;

  const loading = status === "loading";

  /**
   * Проверяем сами, без кнопки.
   *
   * Реестр лежит на сервере и отвечает сразу: сотня продуктов разбирается за
   * секунду, повторный проход берётся из кэша. Отдельный шаг «проверить»
   * ничего не решал — только заставлял нажимать кнопку, чтобы увидеть данные,
   * которые и так доступны.
   *
   * Список уже спрошенных держим отдельно: если сервер ответил ошибкой,
   * результатов не появится, и без этой пометки запрос уходил бы снова и
   * снова.
   */
  const asked = useRef(new Set<string>());
  const pending = names.filter(
    (n) => !results[industryKey(n)] && !asked.current.has(n),
  );
  const pendingKey = pending.join("|");

  useEffect(() => {
    if (ready === false || !pending.length) return;
    for (const n of pending) asked.current.add(n);
    dispatch(checkIndustry(pending));
    // pendingKey — слепок набора: сам массив пересоздаётся на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, ready, dispatch]);

  if (!names.length) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>В графе нет продуктов</div>
        <p className={styles.emptyText}>
          Проверять по реестру нечего: промышленные данные собираются по узлам
          продуктов.
        </p>
      </div>
    );
  }

  if (ready === false) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Реестр не подключён</div>
        <p className={styles.emptyText}>
          {reason ??
            "База ГИСП на сервере не найдена. Пока её нет, проверять продукты не по чему."}
        </p>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>
          {error ? "Не удалось проверить" : "Сверяем с реестром…"}
        </div>
        <p className={styles.emptyText}>
          {error ??
            `В графе ${names.length} продуктов. Смотрим по реестру российской ` +
              "промышленной продукции, какие из них выпускаются в России и кем."}
        </p>
        {error && (
          <button
            type="button"
            className={styles.checkBtn}
            disabled={loading}
            onClick={() => {
              asked.current.clear();
              dispatch(checkIndustry(names));
            }}
          >
            <ShieldCheckIcon size={15} />
            {loading ? "Проверяем…" : "Повторить"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${compact ? styles.wrapPanel : ""}`}>
      {compact ? (
        /* На экране 1080p четыре плитки занимали почти всю высоту панели, и на
           сам список оставалась одна строка. Те же числа — строкой чипов. */
        <div className={styles.chips}>
          <span className={styles.chip}>
            <PlantIcon size={13} />
            {stats.producers} производителей
          </span>
          <span className={styles.chip}>
            <FlaskIcon size={13} />
            {confirmed} из {names.length} продуктов
          </span>
          <span className={styles.chip}>
            <BookIcon size={13} />
            {stats.entries} записей
          </span>
          <span className={styles.chip}>
            <FocusIcon size={13} />
            {stats.regions} регионов
          </span>
        </div>
      ) : (
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <PlantIcon size={20} className={styles.tileIcon} />
          <div>
            <span className={styles.tileLabel}>Производителей</span>
            <span className={styles.tileValue}>{stats.producers}</span>
          </div>
        </div>
        <div className={styles.tile}>
          <FlaskIcon size={20} className={styles.tileIcon} />
          <div>
            <span className={styles.tileLabel}>Продуктов в реестре</span>
            <span className={styles.tileValue}>
              {confirmed} <span className={styles.tileOf}>из {names.length}</span>
            </span>
          </div>
        </div>
        <div className={styles.tile}>
          <BookIcon size={20} className={styles.tileIcon} />
          <div>
            <span className={styles.tileLabel}>Реестровых позиций</span>
            <span className={styles.tileValue}>{stats.entries}</span>
          </div>
        </div>
        <div className={styles.tile}>
          <FocusIcon size={20} className={styles.tileIcon} />
          <div>
            <span className={styles.tileLabel}>Регионов</span>
            <span className={styles.tileValue}>{stats.regions}</span>
          </div>
        </div>
      </div>
      )}

      <div className={styles.filters}>
        <label className={styles.search}>
          <SearchIcon size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              showMissing
                ? "Поиск по названию продукта…"
                : "Поиск по производителю, продукту или ИНН…"
            }
          />
        </label>

        {/* Отборы описывают запись реестра: у ненайденных описывать нечего. */}
        {!showMissing && (
          <>
            <select
              className={styles.select}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            >
              <option value="">Продукт</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">Регион</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div className={styles.segmented}>
              {STATUS_FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.segment} ${
                    statusFilter === value ? styles.segmentActive : ""
                  }`}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Записи реестра и ненайденные продукты — два разных списка, а не два
            состояния одного отбора: у ненайденных нет ни производителя, ни
            региона, ни статуса, и отборы выше для них просто скрыты.

            Стоит в конце строки и прижат вправо, чтобы не прыгал с места на
            место, когда середина строки исчезает. */}
        <div className={`${styles.segmented} ${styles.viewSwitch}`}>
          {(
            [
              ["entries", `Записи реестра (${rows.length})`],
              ["missing", `Нет в реестре (${missing.length})`],
            ] as Array<["entries" | "missing", string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`${styles.segment} ${view === value ? styles.segmentActive : ""}`}
              onClick={() => setView(value)}
              aria-pressed={view === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {checked < names.length && (
        <p className={styles.note}>
          {loading
            ? `Сверяем с реестром: ${checked} из ${names.length}…`
            : `Проверено ${checked} из ${names.length} продуктов.`}
        </p>
      )}

      {showMissing ? (
        <>
          {/* Почему их тут много: реестр про товарную продукцию, а граф — про
              промежуточные потоки. Без этой строки список читается как
              «программа не справилась». */}
          {missing.length > 0 && (
            <p className={styles.note}>
              Реестр ПП №719 охватывает товарную продукцию. Промежуточных
              веществ цепочки в нём нет — их не продают, и на подтверждение
              происхождения никто не заявляет.
            </p>
          )}
          <ul className={`${styles.cards} ${compact ? styles.cardsScroll : ""}`}>
            {pagedMissing.slice.map((name) => (
              <li key={name} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.producer}>{name}</span>
                  <span className={`${styles.status} ${styles.statusMissing}`}>
                    Нет записи
                  </span>
                </div>
              </li>
            ))}
            {!missingVisible.length && (
              <li className={styles.emptyRows}>
                {missing.length
                  ? "По этому запросу ничего нет."
                  : "Все проверенные продукты нашлись в реестре."}
              </li>
            )}
          </ul>
        </>
      ) : compact ? (
        <ul className={`${styles.cards} ${styles.cardsScroll}`}>
          {paged.slice.map((r, i) => (
            <li key={`${r.inn ?? r.producer}-${r.regNumber ?? r.product}-${i}`} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.producer} title={r.producerFull ?? undefined}>
                  {r.producer}
                </span>
                <span
                  className={`${styles.status} ${
                    r.status === "active" ? styles.statusActive : styles.statusArchived
                  }`}
                >
                  {r.statusLabel}
                </span>
              </div>
              <span className={styles.product}>{r.product}</span>
              <div className={styles.cardMeta}>
                {r.inn && <span className={styles.inn}>ИНН {r.inn}</span>}
                {r.region && (
                  <span
                    className={r.regionFromInn ? styles.regionGuess : undefined}
                    title={
                      r.regionFromInn
                        ? "Определён по ИНН — это регион учёта организации, " +
                          "а не обязательно место производства"
                        : undefined
                    }
                  >
                    {r.region}
                  </span>
                )}
                {r.regNumber && <span>№ {r.regNumber}</span>}
              </div>
            </li>
          ))}
          {!visible.length && (
            <li className={styles.emptyRows}>
              По этим условиям записей нет. Снимите отбор или измените запрос.
            </li>
          )}
        </ul>
      ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Производитель</th>
              <th>ИНН</th>
              <th>Продукт</th>
              <th>Регион</th>
              <th>Статус в ГИСП</th>
              <th>Реестровая запись</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((r, i) => (
              <tr key={`${r.inn ?? r.producer}-${r.regNumber ?? r.product}-${i}`}>
                <td>
                  <span className={styles.producer} title={r.producerFull ?? undefined}>
                    {r.producer}
                  </span>
                </td>
                <td className={styles.inn}>{r.inn ?? "—"}</td>
                <td>
                  {r.product}
                  {r.product !== r.source && (
                    <span className={styles.product}>по узлу «{r.source}»</span>
                  )}
                </td>
                <td className={styles.region}>
                  {r.region ? (
                    <span
                      className={r.regionFromInn ? styles.regionGuess : undefined}
                      title={
                        r.regionFromInn
                          ? "Определён по ИНН — это регион учёта организации, " +
                            "а не обязательно место производства"
                          : undefined
                      }
                    >
                      {r.region}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.status} ${
                      r.status === "active" ? styles.statusActive : styles.statusArchived
                    }`}
                    title={
                      r.status === "archived" && r.endedAt
                        ? `Прекращена ${r.endedAt}`
                        : undefined
                    }
                  >
                    {r.statusLabel}
                  </span>
                </td>
                <td>
                  {r.regNumber ? (
                    <a
                      className={styles.listLink}
                      href={GISP_REGISTRY_URL}
                      target="_blank"
                      rel="noreferrer"
                      title="Открыть реестр на сайте ГИСП"
                    >
                      № {r.regNumber}
                      <LinkIcon size={12} />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visible.length && (
          <p className={styles.emptyRows}>
            По этим условиям записей нет. Снимите отбор или измените запрос.
          </p>
        )}
      </div>
      )}

      <Pagination
        page={page.page}
        pages={page.pages}
        from={page.from}
        to={page.to}
        total={page.total}
        onChange={page.setPage}
        unit={showMissing ? "продуктов" : "записей"}
      />

      <p className={styles.foot}>
        Источник: Реестр российской промышленной продукции (ПП №719), ГИСП
        Минпромторга России.
        {actualAt ? ` Данные актуальны на ${actualAt}.` : ""}
      </p>
    </div>
  );
};
