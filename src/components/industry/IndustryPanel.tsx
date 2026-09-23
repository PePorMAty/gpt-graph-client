import { useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import type { IndustryMatch, IndustryProducer } from "../../store/api/industry-api";
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

/** Сколько производителей показываем сразу: остальные по кнопке. */
const VISIBLE = 6;

interface Props {
  /** Название продукта так, как оно записано в узле графа. */
  productName: string;
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
export const IndustryPanel: FC<Props> = ({ productName }) => {
  const dispatch = useAppDispatch();
  const { results, ready, reason, actualAt, status, error } = useAppSelector(
    (s) => s.industry,
  );
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
          бесполезен. */}
      {info.okpd2 && (
        <div className={styles.classLine}>
          <span className={styles.codeLabel}>ОКПД2</span>
          <a
            className={styles.codeValue}
            href={okpd2Url(info.okpd2)}
            target="_blank"
            rel="noreferrer noopener"
            title="Открыть код в классификаторе"
          >
            {info.okpd2}
          </a>
          {/* Кода нет в действующем классификаторе. Пометка идёт сразу за
              самим кодом, до названия: название-то у него найдётся — по живой
              родительской группе, — и без пометки выглядело бы обычным. */}
          {info.okpd2Retired && (
            <span
              className={styles.codeRetired}
              title="Код был присвоен записи при регистрации, а сейчас в классификаторе его нет"
            >
              снят
            </span>
          )}
          {info.okpd2Name && (
            <span className={styles.codeName}>{info.okpd2Name}</span>
          )}
          {/* У записей реестра коды разные, и продукту достаётся самый
              частый. Сколько их всего — само по себе признак: много кодов
              значит, что записи собрались разнородные. */}
          {!!info.okpd2Others && (
            <span className={styles.codeExtra}>
              у остальных записей ещё{" "}
              {info.okpd2Others === 1 ? "код" : `кодов: ${info.okpd2Others}`}
            </span>
          )}
        </div>
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
