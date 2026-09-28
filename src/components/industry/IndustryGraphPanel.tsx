import { useEffect, useMemo, useRef, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import type {
  IndustryProducer,
  IndustryProductInfo,
} from "../../store/api/industry-api";
import { plural } from "../../utils/plural";
import { GISP_REGISTRY_URL, okpd2Url } from "./gisp";
import {
  STATUS_FILTERS,
  matchesStatus,
  type StatusFilter,
} from "./statusFilter";
import { collectCompanies, companyKey } from "./companies";
import { CompanyFilter } from "./CompanyFilter";
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
  ChevronDownIcon,
  ChevronRightIcon,
} from "../icons";
import styles from "./Industry.module.css";

/** Строка списка: запись реестра вместе с продуктом графа, по которому нашлась. */
interface Row extends IndustryProducer {
  /** Название узла графа — по нему шёл поиск. */
  source: string;
}

/** Продукт графа и предприятия, которые его выпускают. */
interface Group {
  /** Название узла графа. */
  name: string;
  info: IndustryProductInfo;
  /** Сколько предприятий у продукта всего, без отборов. */
  total: number;
  /** Предприятия, прошедшие отборы. */
  rows: Row[];
}

/** Какие продукты раскрыты. Живёт, пока не сменились отборы. */
interface OpenState {
  /** Слепок отборов, при которых состояние заведено. */
  sig: string;
  /** «Развернуть все» / «Свернуть все»; null — как решают сами отборы. */
  all: boolean | null;
  /** Продукты, раскрытые или свёрнутые вручную наперекор общему правилу. */
  toggled: Set<string>;
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

/** Регион с оговоркой, если он выведен из ИНН. */
const Region: FC<{ row: Row }> = ({ row }) => (
  <span
    className={row.regionFromInn ? styles.regionGuess : undefined}
    title={
      row.regionFromInn
        ? "Определён по ИНН — это регион учёта организации, " +
          "а не обязательно место производства"
        : undefined
    }
  >
    {row.region}
  </span>
);

/**
 * Промышленные данные по всему графу — вкладка библиотеки и раздел
 * «Промышленное знание» левой панели.
 *
 * Список вложенный: продукты графа, под каждым — предприятия, которые его
 * выпускают. Плоский список записей отвечал на вопрос «кто есть в реестре»,
 * а спрашивают другое — «что из графа выпускается и кем»: в плоском списке
 * продукт терялся среди сотни строк с одинаковыми «АО» и «ООО». Под названием
 * продукта — его класс по ОКПД2: по одному названию не понять, к чему реестр
 * его отнёс.
 *
 * Отбор «Компания» показывает продукцию одного производителя — например,
 * всё, что на графе выпускает «ГК «Титан»».
 */
export const IndustryGraphPanel: FC<Props> = ({ productNames, compact = false }) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );

  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [region, setRegion] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /**
   * Что показываем: продукты, найденные в реестре, или продукты, которых там
   * нет.
   *
   * Ненайденные в основной список не попадают по устройству — предприятий у
   * них ноль, — а вопрос «чего в реестре нет» не менее важен: это либо
   * непрофильная продукция, либо название, под которым реестр её не знает.
   */
  const [view, setView] = useState<"entries" | "missing">("entries");

  // По алфавиту: в порядке узлов список продуктов читался бы вразнобой.
  const names = useMemo(
    () =>
      [...new Set(productNames.map((n) => String(n ?? "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ru"),
      ),
    [productNames],
  );

  /** Все записи реестра по продуктам графа, по одной на предприятие. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const name of names) {
      for (const p of results[industryKey(name)]?.producers ?? []) {
        out.push({ ...p, source: name });
      }
    }
    return out;
  }, [names, results]);

  const companies = useMemo(() => collectCompanies(rows), [rows]);
  // Выбранной компании может не оказаться в другом графе: тогда отбора нет,
  // а не пустой список с непонятной причиной.
  const activeCompany = companies.find((c) => c.key === company) ?? null;

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
    const regions = new Set<string>();
    for (const r of rows) if (r.region) regions.add(r.region);
    // Записей у предприятия бывает несколько, а в списке оно одной строкой:
    // число записей берём у сервера.
    let entries = 0;
    for (const n of names) entries += results[industryKey(n)]?.entryCount ?? 0;
    return { producers: companies.length, regions: regions.size, entries };
  }, [rows, names, results, companies]);

  const regionOptions = useMemo(
    () => [...new Set(rows.map((r) => r.region).filter(Boolean))].sort() as string[],
    [rows],
  );

  /** Продукты с предприятиями, прошедшими отборы. */
  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Group[] = [];
    for (const name of names) {
      const info = results[industryKey(name)];
      if (!info?.producers?.length) continue;
      if (product && name !== product) continue;
      // Запрос о самом продукте — по названию или классу — оставляет его
      // целиком: искали продукт, а не одно из его предприятий.
      const aboutProduct =
        !q ||
        name.toLowerCase().includes(q) ||
        (info.okpd2 ?? "").includes(q) ||
        (info.okpd2Name ?? "").toLowerCase().includes(q);
      const matched: Row[] = [];
      for (const p of info.producers) {
        if (activeCompany && companyKey(p) !== activeCompany.key) continue;
        if (region && p.region !== region) continue;
        if (!matchesStatus(p.status, statusFilter)) continue;
        if (
          !aboutProduct &&
          !p.producer.toLowerCase().includes(q) &&
          !(p.producerFull ?? "").toLowerCase().includes(q) &&
          !p.product.toLowerCase().includes(q) &&
          !(p.inn ?? "").includes(q)
        ) {
          continue;
        }
        matched.push({ ...p, source: name });
      }
      if (matched.length) {
        out.push({ name, info, total: info.producers.length, rows: matched });
      }
    }
    return out;
  }, [names, results, query, product, activeCompany, region, statusFilter]);

  const filtered = Boolean(
    query.trim() || activeCompany || product || region || statusFilter !== "all",
  );
  const shownEnterprises = groups.reduce((n, g) => n + g.rows.length, 0);

  const resetFilters = () => {
    setQuery("");
    setCompany("");
    setProduct("");
    setRegion("");
    setStatusFilter("all");
  };

  // ─── Какие продукты раскрыты ───
  // Без отборов продукты свёрнуты: список читается как перечень продуктов
  // графа, предприятия — по щелчку. Отбор по компании или поиск раскрывают
  // всё: ради найденных предприятий их и ставят. Сменились отборы — ручные
  // раскрытия забываются, иначе правило «раскрыто по отбору» не срабатывало бы.
  const filterSig = [query.trim(), activeCompany?.key ?? "", product, region, statusFilter].join(
    "\u0001",
  );
  const [openState, setOpenState] = useState<OpenState>(() => ({
    sig: filterSig,
    all: null,
    toggled: new Set(),
  }));
  const openNow: OpenState =
    openState.sig === filterSig
      ? openState
      : { sig: filterSig, all: null, toggled: new Set() };
  const openByDefault =
    openNow.all ?? Boolean(query.trim() || activeCompany || groups.length === 1);
  const isOpen = (name: string) => openByDefault !== openNow.toggled.has(name);

  const toggleGroup = (name: string) =>
    setOpenState((prev) => {
      const base: OpenState =
        prev.sig === filterSig ? prev : { sig: filterSig, all: null, toggled: new Set() };
      const toggled = new Set(base.toggled);
      if (toggled.has(name)) toggled.delete(name);
      else toggled.add(name);
      return { ...base, toggled };
    });

  // Сменились отборы — список с начала: иначе после выбора компании он
  // оставался прокрученным туда, где до этого читали, и первые продукты
  // оказывались за верхним краем.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [filterSig]);

  // Продуктов на большом графе — сотня: листаем продуктами, а не строками.
  const paged = usePaged(groups);
  const pagedMissing = usePaged(missingVisible);
  const showMissing = view === "missing";
  const page = showMissing ? pagedMissing : paged;
  const allOpen = paged.slice.length > 0 && paged.slice.every((g) => isOpen(g.name));

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

  /**
   * Название предприятия. Щелчок — вся продукция этой компании на графе:
   * увидели «Титан» у толуола — одним нажатием видно, что ещё он выпускает.
   */
  const companyName = (r: Row) =>
    activeCompany?.key === companyKey(r) ? (
      <span className={styles.producer} title={r.producerFull ?? undefined}>
        {r.producer}
      </span>
    ) : (
      <button
        type="button"
        className={styles.companyLink}
        onClick={() => setCompany(companyKey(r))}
        title={`${r.producerFull ?? r.producer}\nПоказать всю продукцию компании на графе`}
      >
        {r.producer}
      </button>
    );

  const statusBadge = (r: Row) => (
    <span
      className={`${styles.status} ${
        r.status === "active" ? styles.statusActive : styles.statusArchived
      }`}
      title={r.status === "archived" && r.endedAt ? `Прекращена ${r.endedAt}` : undefined}
    >
      {r.statusLabel}
    </span>
  );

  /** Предприятия продукта: карточками в панели, таблицей в библиотеке. */
  const enterprises = (g: Group) =>
    compact ? (
      <ul className={styles.entList}>
        {g.rows.map((r, i) => (
          <li key={`${companyKey(r)}-${i}`} className={styles.ent}>
            <div className={styles.cardHead}>
              {companyName(r)}
              {statusBadge(r)}
            </div>
            <span className={styles.product}>{r.product}</span>
            <div className={styles.cardMeta}>
              {r.inn && <span className={styles.inn}>ИНН {r.inn}</span>}
              {r.region && <Region row={r} />}
              {r.regNumber && <span>№ {r.regNumber}</span>}
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <div className={styles.groupTable}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Производитель</th>
              <th>ИНН</th>
              <th>Продукт в реестре</th>
              <th>Регион</th>
              <th>Статус в ГИСП</th>
              <th>Реестровая запись</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={`${companyKey(r)}-${i}`}>
                <td>{companyName(r)}</td>
                <td className={styles.inn}>{r.inn ?? "—"}</td>
                <td>{r.product}</td>
                <td className={styles.region}>{r.region ? <Region row={r} /> : "—"}</td>
                <td>{statusBadge(r)}</td>
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
      </div>
    );

  return (
    <div className={`${styles.wrap} ${compact ? styles.wrapPanel : ""}`}>
      {compact ? (
        /* На экране 1080p четыре плитки занимали почти всю высоту панели, и на
           сам список оставалась одна строка. Те же числа — строкой чипов. */
        <div className={styles.chips}>
          <span className={styles.chip}>
            <PlantIcon size={13} />
            {stats.producers}{" "}
            {plural(stats.producers, "производитель", "производителя", "производителей")}
          </span>
          <span className={styles.chip}>
            <FlaskIcon size={13} />
            {confirmed} из {names.length}{" "}
            {plural(names.length, "продукта", "продуктов", "продуктов")}
          </span>
          <span className={styles.chip}>
            <BookIcon size={13} />
            {stats.entries} {plural(stats.entries, "запись", "записи", "записей")}
          </span>
          <span className={styles.chip}>
            <FocusIcon size={13} />
            {stats.regions} {plural(stats.regions, "регион", "региона", "регионов")}
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
                : "Поиск по продукту, производителю или ИНН…"
            }
          />
        </label>

        {/* Отборы описывают запись реестра: у ненайденных описывать нечего. */}
        {!showMissing && (
          <>
            <CompanyFilter
              options={companies}
              value={activeCompany?.key ?? ""}
              onChange={setCompany}
              wide={compact}
            />

            {/* В панели продукт и так строка списка, а найти его быстрее
                поиском: место под отбор там нужнее компании и региону. */}
            {!compact && (
              <select
                className={styles.select}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                aria-label="Продукт"
              >
                <option value="">Продукт</option>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}

            <select
              className={styles.select}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Регион"
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

        {/* Найденные и ненайденные продукты — два разных списка, а не два
            состояния одного отбора: у ненайденных нет ни производителя, ни
            региона, ни статуса, и отборы выше для них просто скрыты.

            Стоит в конце строки и прижат вправо, чтобы не прыгал с места на
            место, когда середина строки исчезает. */}
        <div className={`${styles.segmented} ${styles.viewSwitch}`}>
          {(
            [
              ["entries", `В реестре (${confirmed})`],
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
            {pagedMissing.slice.map((name) => {
              // Категория классификатора, если она у вещества есть. Без неё
              // «нет записи» читается как «мы не справились»: человек шёл на
              // сайт ОКПД2, находил там вещество и переставал верить списку.
              const category = results[industryKey(name)]?.category ?? null;
              return (
                <li key={name} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.producer}>{name}</span>
                    <span className={`${styles.status} ${styles.statusMissing}`}>
                      Нет записи
                    </span>
                  </div>
                  {category && (
                    <div className={styles.cardMeta}>
                      <span className={styles.codeLabel}>ОКПД2</span>
                      <a
                        className={styles.codeValue}
                        href={okpd2Url(category.code)}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Категория в классификаторе — записей реестра под ней нет"
                      >
                        {category.code}
                      </a>
                      <span className={styles.codeName}>{category.name}</span>
                    </div>
                  )}
                </li>
              );
            })}
            {!missingVisible.length && (
              <li className={styles.emptyRows}>
                {missing.length
                  ? "По этому запросу ничего нет."
                  : "Все проверенные продукты нашлись в реестре."}
              </li>
            )}
          </ul>
        </>
      ) : (
        <>
          {/* Что осталось после отборов и как вернуть всё. С компанией — прямо
              ответ на вопрос, ради которого её выбирали. */}
          {groups.length > 0 && (
            <div className={styles.listBar}>
              <span className={styles.listBarText}>
                {activeCompany
                  ? `${activeCompany.label} — ${groups.length} ${plural(
                      groups.length,
                      "продукт",
                      "продукта",
                      "продуктов",
                    )} графа`
                  : filtered
                    ? `Найдено: ${groups.length} ${plural(
                        groups.length,
                        "продукт",
                        "продукта",
                        "продуктов",
                      )}, ${shownEnterprises} ${plural(
                        shownEnterprises,
                        "предприятие",
                        "предприятия",
                        "предприятий",
                      )}`
                    : null}
              </span>
              <span className={styles.listBarActions}>
                {filtered && (
                  <button type="button" className={styles.linkBtn} onClick={resetFilters}>
                    Сбросить отборы
                  </button>
                )}
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() =>
                    setOpenState({ sig: filterSig, all: !allOpen, toggled: new Set() })
                  }
                >
                  {allOpen ? "Свернуть все" : "Развернуть все"}
                </button>
              </span>
            </div>
          )}

          <ul
            ref={listRef}
            className={`${styles.groups} ${compact ? styles.cardsScroll : ""}`}
          >
            {paged.slice.map((g) => {
              const open = isOpen(g.name);
              const narrowed = g.rows.length < g.total;
              return (
                <li key={g.name} className={styles.group}>
                  <button
                    type="button"
                    className={styles.groupHead}
                    onClick={() => toggleGroup(g.name)}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                    <span className={styles.groupTitle}>
                      <span className={styles.groupName}>{g.name}</span>
                      {/* Класс продукции: по одному названию не понять, к чему
                          реестр продукт отнёс. */}
                      {g.info.okpd2 && (
                        <span className={styles.groupClass}>
                          <span className={styles.groupCode}>{g.info.okpd2}</span>
                          {g.info.okpd2Name && <> {g.info.okpd2Name}</>}
                          {g.info.viaFormulation && (
                            <span className={styles.groupTag}>в составе препарата</span>
                          )}
                        </span>
                      )}
                    </span>
                    <span
                      className={styles.groupCount}
                      title={
                        narrowed
                          ? "Под отборы подходит часть предприятий продукта"
                          : undefined
                      }
                    >
                      {narrowed
                        ? `${g.rows.length} из ${g.total} ${plural(
                            g.total,
                            "предприятия",
                            "предприятий",
                            "предприятий",
                          )}`
                        : `${g.total} ${plural(
                            g.total,
                            "предприятие",
                            "предприятия",
                            "предприятий",
                          )}`}
                    </span>
                  </button>
                  {open && <div className={styles.groupBody}>{enterprises(g)}</div>}
                </li>
              );
            })}
            {!groups.length && (
              <li className={styles.emptyRows}>
                {confirmed
                  ? "По этим условиям ничего нет. Снимите отбор или измените запрос."
                  : "Ни один продукт графа в реестре не найден."}
                {filtered && confirmed > 0 && (
                  <>
                    {" "}
                    <button type="button" className={styles.linkBtn} onClick={resetFilters}>
                      Сбросить отборы
                    </button>
                  </>
                )}
              </li>
            )}
          </ul>
        </>
      )}

      <Pagination
        page={page.page}
        pages={page.pages}
        from={page.from}
        to={page.to}
        total={page.total}
        onChange={page.setPage}
        unit="продуктов"
      />

      <p className={styles.foot}>
        Источник: Реестр российской промышленной продукции (ПП №719), ГИСП
        Минпромторга России.
        {actualAt ? ` Данные актуальны на ${actualAt}.` : ""}
      </p>
    </div>
  );
};
