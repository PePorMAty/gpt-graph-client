import { useState, type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAppDispatch } from "../../store/hooks";
import { removeMaterialBalance } from "../../store/slices/materialBalanceSlice";
import {
  coefficientItems,
  formatBasisAmount,
  formatPercent,
  formatWhen,
  isPairCalc,
  massFraction,
  sortSources,
  splitCoefficient,
  STATUS_TEXT,
  STATUS_TONE,
  statusReason,
  type BalanceShares,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import { mentionsRefs, readableRecord } from "../../utils/readableModelText";
import {
  balanceSourceCopyHref,
  type BalanceSource,
  type BalanceStatus,
} from "../../store/api/material-balance-api";
import { sourceHref } from "../../store/api/local-sources-api";
import { plural } from "../../utils/plural";
import { ChevronDownIcon, InfoIcon, NoteIcon, SigmaIcon } from "../icons";
import { BalanceTable, CardTitle } from "./BalanceTable";
import md from "../markdown-editor/MarkdownEditor.module.css";
import styles from "./MaterialBalance.module.css";

export const Status: FC<{ status: BalanceStatus }> = ({ status }) => (
  <span className={`${styles.status} ${styles[`status_${STATUS_TONE[status]}`]}`}>
    {STATUS_TEXT[status]}
  </span>
);

/**
 * Ответ модели кусками Markdown; ссылки — в новой вкладке. inline — строкой,
 * без абзаца: для пунктов списка.
 */
export const Markdown: FC<{ text: string; inline?: boolean }> = ({ text, inline }) =>
  text.trim() ? (
    <div className={`${md.markdownBody} ${inline ? styles.inlineMd : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
          ...(inline ? { p: ({ children }) => <span>{children}</span> } : {}),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  ) : inline ? null : (
    <p className={styles.muted}>Модель этот раздел не заполнила.</p>
  );

/** Как сервер проверил источник — меткой. */
const SourceCheck: FC<{ source: BalanceSource }> = ({ source: src }) => {
  const c = src.server;
  if (!c) return null;
  if (c.status === "local") {
    return (
      <div className={`${styles.sourceCheck} ${styles.sourceCheckLocal}`}>
        Документ базы источников — использован в первую очередь
      </div>
    );
  }
  if (c.status === "failed") {
    return (
      <div className={`${styles.sourceCheck} ${styles.sourceCheckFailed}`}>
        Сервер не смог подтвердить: {c.reason}
      </div>
    );
  }
  return (
    <div className={`${styles.sourceCheck} ${styles.sourceCheckSaved}`}>
      Загружен и сохранён сервером{c.note ? ` (${c.note})` : ""}
      {c.webDocumentId ? (
        <>
          {" · "}
          <a href={balanceSourceCopyHref(c.webDocumentId, "text")} target="_blank" rel="noreferrer noopener">
            текст копии
          </a>
          {" · "}
          <a href={balanceSourceCopyHref(c.webDocumentId, "file")} target="_blank" rel="noreferrer noopener">
            {c.kind === "pdf" ? "PDF" : "оригинал"}
          </a>
        </>
      ) : null}
    </div>
  );
};

/** Источник: ссылка, тип и организация, для чего использован, проверка, что взято. */
export const SourceItem: FC<{ source: BalanceSource }> = ({ source: src }) => (
  <div className={styles.sourceItem}>
    [{src.id}]{" "}
    {src.url ? (
      <a href={sourceHref(src.url)} target="_blank" rel="noreferrer noopener">
        {src.title || src.url}
      </a>
    ) : (
      src.title
    )}
    <div className={styles.sourceMeta}>
      {[src.type, src.org, src.usedFor && `использован для: ${src.usedFor}`]
        .filter(Boolean)
        .join(" · ")}
    </div>
    <SourceCheck source={src} />
    {src.block && (
      <details className={styles.more}>
        <summary>Что взято из источника</summary>
        <Markdown text={src.block} />
      </details>
    )}
  </div>
);

/** «Источники: 1 раздел из базы, 2 загружены сервером, 1 не подтверждён». */
function checksText(c: NonNullable<MaterialBalanceCalc["record"]["sourceChecks"]>): string {
  const parts = [
    c.local ? `${c.local} из базы источников` : null,
    c.saved ? `${c.saved} загружены и сохранены сервером` : null,
    c.failed ? `${c.failed} сервер подтвердить не смог` : null,
  ].filter(Boolean);
  const retry = retryText(c);
  return parts.length ? `Источники: ${parts.join(", ")}.${retry}` : retry.trim();
}

/** Был ли второй запрос к модели и зачем; что нашёл сервер в интернете. */
function retryText(c: NonNullable<MaterialBalanceCalc["record"]["sourceChecks"]>): string {
  const r = c.retry;
  // Расчёты до этой версии: второй круг был только из-за незагрузившихся.
  if (!r) return c.rounds > 1 ? " Часть источников не загрузилась — модель заменила их вторым запросом." : "";
  const why = [
    r.failed
      ? `${r.failed} ${plural(r.failed, "источник не загрузился", "источника не загрузились", "источников не загрузились")}`
      : null,
    r.missing.length ? `не было данных для ${r.missing.map((n) => `«${n}»`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const s = r.search;
  const searched = !s
    ? r.missing.length
      ? " Модель искала их в интернете вторым запросом."
      : ""
    : s.error
      ? ` Поиск в интернете сервером не удался: ${s.error}`
      : s.confirmed
        ? ` Сервер нашёл в интернете ${s.sources} ${plural(s.sources, "источник", "источника", "источников")}, подтвердил ${s.confirmed} (числа есть на странице) и отдал модели.`
        : s.sources
          ? ` Сервер нашёл в интернете ${s.sources} ${plural(s.sources, "источник", "источника", "источников")}, но чисел из них на страницах нет — модели не отданы.`
          : " Сервер искал в интернете, но ничего не нашёл.";
  const replaced = r.failed ? " Незагрузившиеся модель заменяла вторым запросом." : "";
  return r.used
    ? ` В первом ответе ${why}.${searched}${replaced} Показан второй ответ модели.`
    : ` В первом ответе ${why}.${searched} Второй ответ модели оказался не полнее — показан первый.`;
}

function tookText(ms: number | null | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`;
}

interface Props {
  nodeId: string;
  calc: MaterialBalanceCalc;
  /** Подпись узла по id; нет узла — пусто. */
  labelOf: (id: string | undefined) => string;
  /** Сохранить правки процентов; нет — таблица только для чтения. */
  onShares?: (shares: BalanceShares) => void;
  /** Подробный расчёт продукта. */
  onProduct?: (nodeId: string) => void;
  /** Показать узел на полотне. */
  onGo?: (nodeId: string) => void;
  /** Узел графа с таким названием — для потоков сверх сырья и продуктов. */
  findNode?: (name: string) => string | undefined;
  /** Поставить поток сверх графа (вода, кислород) на граф. */
  onPlaceFlow?: (flow: { name: string; direction: "in" | "out" | "" }) => void;
  /** Роль сырья или продукта расчёта (реагент, побочный) — с его связи на графе. */
  roleOf?: (ref: string) => "reagent" | "byproduct" | undefined;
  /** «Новый расчёт» — форма с опорным сырьём и продуктами этого расчёта. */
  onNewRequest?: () => void;
  /** «Показать на графе» — камера к преобразованию. */
  onShowOnGraph?: () => void;
  readOnly?: boolean;
}

/**
 * Расчёт преобразования целиком: сведения о расчёте, таблица материального
 * баланса в процентах (сырьё, продукты, потоки сверх графа), коэффициенты,
 * примечания, ответ модели по разделам, источники. Расчёт одного продукта —
 * по щелчку на нём в таблице.
 *
 * Тексты модели — читаемыми (readableRecord): без LaTeX и служебных имён
 * промпта. Обозначения P1, P2 из ответа расшифрованы над ним.
 */
export const CalcDetails: FC<Props> = ({
  nodeId,
  calc,
  labelOf,
  onShares,
  onProduct,
  onGo,
  findNode,
  onPlaceFlow,
  roleOf,
  onNewRequest,
  onShowOnGraph,
  readOnly,
}) => {
  const dispatch = useAppDispatch();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const record = readableRecord(calc.record);
  const nameOf = (ref: string) => labelOf(calc.nodeIds[ref]) || record.refs.find((r) => r.ref === ref)?.name || ref;
  const reason = statusReason(record);
  const coefs = coefficientItems(record);
  const tName = labelOf(nodeId) || record.transformation;
  const transitions = record.steps?.length
    ? record.steps.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n")
    : record.sections.transitions;

  return (
    <>
      <div className={styles.detailsHead}>
        <div className={styles.itemTitle}>
          Расчёт <Status status={record.status} />
        </div>
        <div className={styles.meta}>
          {formatWhen(record.createdAt)}
          {record.model ? ` · ${record.model}` : ""}
          {calc.fromCache
            ? " · взят из базы"
            : record.tookMs
              ? ` · считал ${tookText(record.tookMs)}`
              : ""}
          {record.customPrompt ? " · свой промпт" : ""}
        </div>
        {record.nature && (
          <div className={styles.meta}>Характер результата: {record.nature}</div>
        )}
        {reason && (
          <p className={styles.reason}>
            <InfoIcon size={16} className={styles.reasonIcon} />
            <span>
              <b>Почему «{STATUS_TEXT[record.status].toLowerCase()}»:</b> {reason}
            </span>
          </p>
        )}
        {record.searchOff && (
          <p className={styles.reason}>
            <InfoIcon size={16} className={styles.reasonIcon} />
            <span>
              <b>Модель считала без поиска в интернете:</b> провайдер отверг для неё
              поиск. Данные — только из базы источников и знаний модели; для
              расчёта с поиском выберите другую модель в «Промпт и модель».
            </span>
          </p>
        )}
        {record.sourceChecks && (
          <p className={styles.note}>{checksText(record.sourceChecks)}</p>
        )}
        {isPairCalc(record) && (
          <p className={styles.note}>
            Расчёт прежней версии — одного продукта из одного сырья на 1 т. Новый расчёт
            посчитает преобразование целиком: всё сырьё и все продукты сразу.
          </p>
        )}
      </div>

      <div className={styles.forTransformation}>
        Расчёт для преобразования: <b>{tName}</b>
      </div>

      <BalanceTable
        record={record}
        nodeIds={calc.nodeIds}
        labelOf={labelOf}
        shares={calc.shares}
        sharesBasis={calc.sharesBasis}
        onShares={readOnly ? undefined : onShares}
        onProduct={onProduct}
        onGo={onGo}
        findNode={findNode}
        onPlaceFlow={readOnly ? undefined : onPlaceFlow}
        roleOf={roleOf}
      />

      {(coefs.length > 0 || record.coefficients.length > 0) && (
        <details className={`${styles.cardBlock} ${styles.fold}`} open>
          <summary className={styles.foldSummary}>
            <CardTitle
              as="span"
              icon={<SigmaIcon size={16} />}
              title="Коэффициенты"
              help="Удельные показатели, по которым считала модель: выходы, расходы, конверсия, состав — с источниками в квадратных скобках."
            />
            <ChevronDownIcon size={16} className={styles.foldChevron} />
          </summary>
          <ul className={styles.coefList}>
            {coefs.map((item, i) => {
              const c = splitCoefficient(item);
              return (
                <li key={i}>
                  {c.label && (
                    <>
                      <Markdown text={c.label} inline />:{" "}
                    </>
                  )}
                  <b>
                    <Markdown text={c.value} inline />
                  </b>
                  {c.refs && <span className={styles.sourceMeta}> · {c.refs}</span>}
                </li>
              );
            })}
            {record.coefficients.map((c, i) => {
              // «кг/кг», «т/т» — доля массы: процентами понятнее.
              const share = massFraction(c);
              return (
                <li key={`old-${i}`}>
                  {c.indicator}
                  {c.fromRef && c.toRef ? ` (${nameOf(c.fromRef)} → ${nameOf(c.toRef)})` : ""}:{" "}
                  <b>
                    {c.valueText}
                    {c.unit && !/%/.test(c.valueText) ? (c.unit === "%" ? "%" : ` ${c.unit}`) : ""}
                  </b>
                  {share ? ` — ${formatPercent(share)}` : ""}
                  {c.source ? <span className={styles.sourceMeta}> · {c.source}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {record.knownData && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Свои данные</h4>
          <p className={styles.note}>{record.knownData}</p>
        </section>
      )}

      <section className={styles.cardBlock}>
        <CardTitle icon={<NoteIcon size={16} />} title="Примечания" />
        <Markdown text={record.sections.notes} />
      </section>

      <section className={styles.section}>
        <p className={styles.muted}>
          Ниже — разделы ответа модели как есть: числа в них на {formatBasisAmount(record)}{" "}
          «{nameOf("P1")}», с которыми она считала; проценты в таблице — по этим числам
          (поправленные вручную — как их вписали).
        </p>
        {mentionsRefs(record) && (
          <p className={`${styles.note} ${styles.legend}`}>
            В ответе модели:{" "}
            {record.refs.map((r) => `${r.ref} — ${r.ref.startsWith("P") ? nameOf(r.ref) : r.name}`).join("; ")}.
          </p>
        )}
        <details className={styles.more}>
          <summary>Расчёт по преобразованию</summary>
          <Markdown text={transitions} />
        </details>
        <details className={styles.more}>
          <summary>Общий баланс участка</summary>
          <Markdown text={record.sections.balance} />
        </details>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Источники ({record.sources.length})</h4>
        {record.sources.length ? (
          sortSources(record.sources).map((src) => <SourceItem key={src.id} source={src} />)
        ) : (
          <p className={styles.muted}>Модель не указала рабочих источников.</p>
        )}
      </section>

      {!readOnly && (
        <div className={`${styles.actions} ${styles.section}`}>
          {onShowOnGraph && (
            <button
              type="button"
              className={styles.secondary}
              onClick={onShowOnGraph}
              disabled={!labelOf(nodeId)}
            >
              Показать на графе
            </button>
          )}
          {onNewRequest && (
            <button
              type="button"
              className={styles.secondary}
              onClick={onNewRequest}
              title="Спросить модель заново — с другими продуктами, данными, промптом или моделью"
            >
              Новый расчёт
            </button>
          )}
          {confirmRemove ? (
            <>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => dispatch(removeMaterialBalance(nodeId, record.id))}
              >
                Да, убрать
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmRemove(false)}
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => setConfirmRemove(true)}
            >
              Убрать из графа
            </button>
          )}
        </div>
      )}
      {confirmRemove && (
        <p className={styles.note}>
          Расчёт уйдёт из графа; в базе сервера он останется, и на таком же
          преобразовании «Рассчитать» вернёт его сразу.
        </p>
      )}
    </>
  );
};
