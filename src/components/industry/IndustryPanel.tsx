import { useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import { updateNodeData } from "../../store/slices/gptSlice";
import type { CodeOverride } from "../../types";
import type {
  IndustryMatch,
  IndustryProducer,
  IndustryProductInfo,
} from "../../store/api/industry-api";
import { GISP_REGISTRY_URL, okpd2Url } from "./gisp";
import {
  STATUS_FILTERS,
  matchesStatus,
  type StatusFilter,
} from "./statusFilter";
import {
  IndustryDataIcon,
  ShieldCheckIcon,
  LinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "../icons";
import { plural } from "../../utils/plural";
import { CodeLine } from "./CodeLine";
import {
  readCodeOverrides,
  withCodeOverride,
  type CodeKind,
} from "./codeOverrides";
import styles from "./Industry.module.css";

/**
 * Насколько уверенно название узла легло на запись реестра.
 *
 * Реестр дробный — 84 тысячи названий на сотню тысяч записей, — и точное
 * совпадение там редкость. Разницу показываем прямо: «нашлось по части слов» и
 * «нашлось целиком» — разные основания доверять числу производителей.
 */
const MATCH_LABELS: Record<IndustryMatch, string> = {
  exact: "точное совпадение названия",
  "all-words": "совпали все слова",
  "core-words": "совпали значимые слова",
  partial: "совпала часть слов",
  prefix: "совпало начало слова",
};

const STRONG: IndustryMatch[] = ["exact", "all-words"];

/**
 * Записи реестра под названием разнородные: разных кодов ОКПД2 три и больше,
 * а под выбранным — меньше половины записей.
 */
function isHeterogeneous(info: IndustryProductInfo): boolean {
  const codes = info.okpd2Codes ?? [];
  if (codes.length < 3 || !info.entryCount) return false;
  return (codes[0]?.count ?? 0) * 2 < info.entryCount;
}

/** Сколько производителей показываем сразу: остальные по кнопке. */
const VISIBLE = 6;

interface Props {
  /** Название продукта так, как оно записано в узле графа. */
  productName: string;
  /** Узел карточки: в нём живут коды, заданные вручную. */
  nodeId?: string | null;
  /** Общий просмотр: коды показываем, править не даём. */
  readOnly?: boolean;
}

/** Одна строка списка: щелчок раскрывает подробности записи реестра. */
const ProducerRow: FC<{ p: IndustryProducer }> = ({ p }) => {
  const [open, setOpen] = useState(false);

  return (
    <li className={styles.prodItem}>
      <button
        type="button"
        className={styles.prodHead}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        <span className={styles.prodName} title={p.producerFull ?? undefined}>
          {p.producer}
        </span>
        <span
          className={`${styles.status} ${
            p.status === "active" ? styles.statusActive : styles.statusArchived
          }`}
        >
          {p.statusLabel}
        </span>
      </button>

      {open && (
        <div className={styles.prodDetails}>
          {p.product && <div className={styles.prodProduct}>{p.product}</div>}

          {/* Коды с расшифровкой: сам по себе «20.16.10.110» ничего не говорит
              о том, к чему запись отнесена. */}
          {p.okpd2 && (
            <div className={styles.code}>
              <span className={styles.codeLabel}>ОКПД2</span>
              <a
                className={styles.codeValue}
                href={okpd2Url(p.okpd2)}
                target="_blank"
                rel="noreferrer noopener"
                title="Открыть код в классификаторе"
              >
                {p.okpd2}
              </a>
              {p.okpd2Name && (
                <span className={styles.codeName}>{p.okpd2Name}</span>
              )}
            </div>
          )}
          {p.tnved && (
            <div className={styles.code}>
              <span className={styles.codeLabel}>ТН ВЭД</span>
              <span className={styles.codeValue}>{p.tnved}</span>
              {p.tnvedName && (
                <span className={styles.codeName}>{p.tnvedName}</span>
              )}
            </div>
          )}

          <div className={styles.prodMeta}>
            {p.inn && <span className={styles.inn}>ИНН {p.inn}</span>}
            {p.region && (
              <span
                className={p.regionFromInn ? styles.regionGuess : undefined}
                title={
                  p.regionFromInn
                    ? "Определён по ИНН — это регион учёта организации, " +
                      "а не обязательно место производства"
                    : undefined
                }
              >
                {p.region}
              </span>
            )}
            {p.regNumber && <span>№ {p.regNumber}</span>}
            {p.status === "archived" && p.endedAt && (
              <span>прекращена {p.endedAt}</span>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

/** Промышленное знание по одному продукту — вкладка карточки. */
export const IndustryPanel: FC<Props> = ({
  productName,
  nodeId,
  readOnly = false,
}) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );
  // Коды, заданные вручную, — в данных узла (codeOverrides).
  const nodeData = useAppSelector((s) =>
    nodeId ? s.graph.data.nodes.find((n) => n.id === nodeId)?.data : undefined,
  );
  const overrides = useMemo(() => readCodeOverrides(nodeData), [nodeData]);
  const editable = !!nodeId && !readOnly;
  const setOverride = (kind: CodeKind, value: CodeOverride | null) => {
    if (!nodeId) return;
    dispatch(
      updateNodeData({
        nodeId,
        data: { codeOverrides: withCodeOverride(overrides, kind, value) },
      }),
    );
  };
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const name = String(productName ?? "").trim();
  const info = useMemo(
    () => (name ? results[industryKey(name)] : undefined),
    [results, name],
  );

  /**
   * Сколько записей под каждым отбором.
   *
   * Нужны, чтобы не предлагать пустое: у половины продуктов все записи
   * действующие, и кнопка «Архив» вела бы в пустой список. Число рядом с
   * подписью отвечает на вопрос сразу, не нажимая.
   */
  const counts = useMemo(() => {
    const all = info?.producers ?? [];
    const active = all.filter((p) => p.status === "active").length;
    return { all: all.length, active, archived: all.length - active };
  }, [info]);

  const producers = useMemo(
    () => (info?.producers ?? []).filter((p) => matchesStatus(p.status, statusFilter)),
    [info, statusFilter],
  );

  const loading = status === "loading";

  if (!name) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>У узла нет названия</div>
        <p className={styles.emptyText}>
          Искать по реестру нечего: сначала задайте название продукта.
        </p>
      </div>
    );
  }

  // Реестра на сервере нет — честно говорим почему, а не показываем пустоту.
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

  // Проверки ещё не было: слой включают тумблером, но в карточку могли зайти
  // и до этого — даём запустить проверку прямо отсюда.
  if (!info) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Проверка по ГИСП не выполнялась</div>
        <p className={styles.emptyText}>
          Посмотрим в реестре российской промышленной продукции, кто выпускает
          «{name}»: производители, ИНН, регионы и статус реестровой записи.
        </p>
        <button
          type="button"
          className={styles.checkBtn}
          disabled={loading}
          onClick={() => dispatch(checkIndustry([name]))}
        >
          <ShieldCheckIcon size={15} />
          {loading ? "Проверяем…" : "Проверить по ГИСП"}
        </button>
        {error && <p className={styles.note}>{error}</p>}
      </div>
    );
  }

  // Подпись не называет вещество: либо заготовка интерфейса («Новый
  // продукт»), либо одни определения («Новый»). Реестр по ней не спрашивали,
  // поэтому «записи нет» было бы неправдой — не искали. И объяснение про
  // охват реестра тут ни при чём: надо просто вписать название.
  if (info.placeholder) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Продукт ещё не назван</div>
        <p className={styles.emptyText}>
          Подпись «{name}» не называет вещество, и в реестре ПП №719 мы по ней
          не искали. Вещества называются существительными: бензол, аммиак,
          серная кислота. Впишите название — и поищем.
        </p>
      </div>
    );
  }

  // «Не найдено» здесь чаще всего не пробел в данных, а свойство продукта:
  // реестр ПП №719 — про товарную продукцию, а промежуточные вещества никто на
  // подтверждение происхождения не заявляет, их не продают. На графе таких
  // узлов больше половины, и подавать это как неудачу поиска — врать.
  if (!info.found) {
    return (
      <div className={styles.empty}>
        <IndustryDataIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Записи в реестре нет</div>
        <p className={styles.emptyText}>
          Реестр ПП №719 охватывает <b>товарную продукцию</b> — то, что
          заявляют на подтверждение российского происхождения. Промежуточных
          веществ технологической цепочки в нём нет: их не продают, они идут на
          следующую установку.
        </p>
        <p className={styles.emptyText}>
          Так что отсутствие записи ничего не говорит о том, производят ли
          «{name}» в России, — реестр про другое.
        </p>

        {/* Категория классификатора — чтобы «нет записи» не читалось как «мы
            не справились». Классификатор и реестр разные вещи: код категории
            существует всегда, запись появляется, только когда завод заявил
            продукцию. Без этой строки человек шёл на сайт ОКПД2, находил там
            вещество и переставал верить карточке. */}
        {info.category && (
          <div className={styles.categoryNote}>
            <span className={styles.categoryLabel}>В классификаторе ОКПД2 это</span>
            <a
              className={styles.codeValue}
              href={okpd2Url(info.category.code)}
              target="_blank"
              rel="noreferrer noopener"
              title="Открыть категорию в классификаторе"
            >
              {info.category.code}
            </a>
            <span className={styles.codeName}>{info.category.name}</span>
            <span className={styles.categoryHint}>
              Категория есть, продукции под ней никто не заявлял.
            </span>
          </div>
        )}
        {/* Позиция ТН ВЭД по названию вещества — тоже классификатор. */}
        {info.tnvedCategory && (
          <div className={styles.categoryNote}>
            <span className={styles.categoryLabel}>В ТН ВЭД это</span>
            <span className={styles.codeValue}>{info.tnvedCategory.code}</span>
            <span className={styles.codeName}>{info.tnvedCategory.name}</span>
          </div>
        )}

        {/* Записи нет, а коды продукту нужны: их задают вручную, категория
            классификатора подставляется в поле. */}
        {(editable || overrides.okpd2 || overrides.tnved) && (
          <div className={styles.ownCodes}>
            <span className={styles.ownCodesTitle}>Коды продукта</span>
            <CodeLine
              kind="okpd2"
              registry={null}
              override={overrides.okpd2}
              suggestion={info.category?.code}
              editable={editable}
              onChange={(v) => setOverride("okpd2", v)}
            />
            <CodeLine
              kind="tnved"
              registry={null}
              override={overrides.tnved}
              suggestion={info.tnvedCategory?.code}
              editable={editable}
              onChange={(v) => setOverride("tnved", v)}
            />
          </div>
        )}
      </div>
    );
  }

  const strong = info.match ? STRONG.includes(info.match) : false;
  const shown = showAll ? producers : producers.slice(0, VISIBLE);
  const hidden = producers.length - shown.length;

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Промышленное знание</span>
        <span
          className={`${styles.match} ${strong ? styles.matchStrong : styles.matchWeak}`}
          title={info.match ? MATCH_LABELS[info.match] : undefined}
        >
          <ShieldCheckIcon size={13} />
          Найден в реестре ПП №719
        </span>
      </div>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{info.producerCount}</span>
          <span className={styles.statLabel}>
            {plural(info.producerCount, "Производитель", "Производителя", "Производителей")}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{info.regionCount}</span>
          {/* Подпись согласуется с числом: «6 Региона» читалось ошибкой. */}
          <span className={styles.statLabel}>
            {plural(info.regionCount, "Регион", "Региона", "Регионов")}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {info.status === "active" ? "Действует" : "В архиве"}
          </span>
          <span className={styles.statLabel}>Статус в реестре</span>
        </div>
      </div>

      {/* Класс продукции отдельной строкой, а не плиткой: название из
          классификатора длиннее, чем помещается в плитку, а без него код
          бесполезен. Код можно поправить: выбрать другой из кодов записей
          или вписать свой (CodeLine). */}
      {(info.okpd2 || overrides.okpd2 || editable) && (
        <CodeLine
          kind="okpd2"
          registry={
            info.okpd2
              ? {
                  code: info.okpd2,
                  name: info.okpd2Name ?? null,
                  nameExact: info.okpd2NameExact,
                  retired: info.okpd2Retired,
                  refinedFrom: info.okpd2Registry ?? null,
                }
              : null
          }
          override={overrides.okpd2}
          variants={info.okpd2Codes}
          editable={editable}
          onChange={(v) => setOverride("okpd2", v)}
        />
      )}

      {/* ТН ВЭД: самый частый код записей реестра, а нет его — позиция по
          названию вещества из классификатора, с пометкой. */}
      {(info.tnved || info.tnvedCategory || overrides.tnved || editable) && (
        <CodeLine
          kind="tnved"
          registry={
            info.tnved
              ? { code: info.tnved, name: info.tnvedName ?? null }
              : info.tnvedCategory
                ? {
                    code: info.tnvedCategory.code,
                    name: info.tnvedCategory.name,
                    byName: true,
                  }
                : null
          }
          override={overrides.tnved}
          variants={info.tnvedCodes}
          editable={editable}
          onChange={(v) => setOverride("tnved", v)}
        />
      )}

      {/* Записи под названием разнородные: кодов много, и выбранный не
          покрывает и половины записей. Так бывает, когда название общее —
          «Плёнки» без материала собирают записи о любых плёнках, и код в
          карточке относится к чужому продукту. */}
      {!overrides.okpd2 && isHeterogeneous(info) && (
        <p className={styles.formulationNote}>
          Записи под этим названием разнородные: у них{" "}
          {info.okpd2Codes?.length ?? 0}{" "}
          {plural(
            info.okpd2Codes?.length ?? 0,
            "разный код",
            "разных кода",
            "разных кодов",
          )}{" "}
          ОКПД2. Похоже, название
          общее и реестр собрал записи о разных продуктах. Уточните название
          — например, материалом: «Плёнки полиамидные» вместо «Плёнки», — или
          выберите код вручную.
        </p>
      )}

      {/* Вещество найдено в составе препарата, а не как самостоятельный
          продукт. Считать это присутствием в реестре — решение заказчика, но
          ОКПД2 у такой записи пестицидный, и молчать об этом нельзя. */}
      {info.viaFormulation && (
        <p className={styles.formulationNote}>
          Вещество названо в составе препарата, а не отдельным продуктом.
          Класс продукции выше — у препарата, а не у самого вещества.
        </p>
      )}

      <div className={styles.listHead}>
        <span className={styles.listTitle}>
          Российские производители ({info.producerCount})
        </span>
        <a
          className={styles.listLink}
          href={GISP_REGISTRY_URL}
          target="_blank"
          rel="noreferrer"
        >
          Открыть на ГИСП
          <LinkIcon size={12} />
        </a>
      </div>

      {/* Тот же отбор, что в панели графа. Реестр хранит и прекращённые
          записи, и на вопрос «кто выпускает СЕЙЧАС» список вперемешку не
          отвечает. Кнопка без записей выключена: вести в пустой список
          незачем, а число рядом с подписью отвечает и без нажатия. */}
      <div className={`${styles.segmented} ${styles.segmentedCard}`}>
        {STATUS_FILTERS.map(([value, label]) => {
          const n = counts[value];
          return (
            <button
              key={value}
              type="button"
              className={`${styles.segment} ${
                statusFilter === value ? styles.segmentActive : ""
              }`}
              onClick={() => setStatusFilter(value)}
              disabled={n === 0}
              aria-pressed={statusFilter === value}
            >
              {label}
              <span className={styles.segmentCount}>{n}</span>
            </button>
          );
        })}
      </div>

      {producers.length === 0 ? (
        <p className={styles.note}>
          Под этот отбор записей нет.
        </p>
      ) : (
        <ul className={styles.prodList}>
          {shown.map((p) => (
            <ProducerRow
              key={`${p.inn ?? p.producer}-${p.regNumber ?? p.product}`}
              p={p}
            />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => setShowAll(true)}
        >
          Показать ещё {hidden}
        </button>
      )}

      <p className={styles.foot}>
        Источник: Реестр российской промышленной продукции (ПП №719), ГИСП
        Минпромторга России.
        {actualAt ? ` Данные актуальны на ${actualAt}.` : ""}
      </p>
    </div>
  );
};
