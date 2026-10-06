import { useMemo, useState, type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { removeMaterialBalance } from "../../store/slices/materialBalanceSlice";
import {
  flowRef,
  formatMass,
  formatPercent,
  formatWhen,
  massFraction,
  refRole,
  scaleForView,
  shownMass,
  STATUS_TEXT,
  STATUS_TONE,
  statusReason,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import { mentionsRefs, readableRecord } from "../../utils/readableModelText";
import type { BalanceStatus } from "../../store/api/material-balance-api";
import md from "../markdown-editor/MarkdownEditor.module.css";
import styles from "./MaterialBalance.module.css";

export const Status: FC<{ status: BalanceStatus }> = ({ status }) => (
  <span className={`${styles.status} ${styles[`status_${STATUS_TONE[status]}`]}`}>
    {STATUS_TEXT[status]}
  </span>
);

/** Ответ модели кусками Markdown; ссылки — в новой вкладке. */
const Markdown: FC<{ text: string }> = ({ text }) =>
  text.trim() ? (
    <div className={md.markdownBody}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  ) : (
    <p className={styles.muted}>Модель этот раздел не заполнила.</p>
  );

function tookText(ms: number | null | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`;
}

interface Props {
  nodeId: string;
  calc: MaterialBalanceCalc;
  /** «Новый расчёт» — форма запроса для этой пары. */
  onNewRequest?: () => void;
  /** «Показать на графе» — камера к преобразованию. */
  onShowOnGraph?: () => void;
}

/**
 * Один расчёт целиком: ключевые потоки, коэффициенты, примечания, расчёт по
 * переходам, общий баланс, источники. Количество сырья — в схеме над ним.
 *
 * Тексты модели — читаемыми (readableRecord): без LaTeX и служебных имён
 * промпта. Обозначения P1, P2 из ответа расшифрованы над ним.
 */
export const CalcDetails: FC<Props> = ({ nodeId, calc, onNewRequest, onShowOnGraph }) => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const record = readableRecord(calc.record);
  const readable = { ...calc, record };

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  /** Подпись узла графа, а если его нет — имя из расчёта. */
  const nameOf = (ref: string) => {
    const node = byId.get(calc.nodeIds[ref]);
    return (
      String(node?.data?.label ?? "").trim() ||
      record.refs.find((r) => r.ref === ref)?.name ||
      ref
    );
  };
  const productRefs = record.refs.filter((r) => r.ref.startsWith("P"));
  const extraFlows = record.flows.filter((f) => !flowRef(record, f.name));
  const reason = statusReason(record);
  const canRequest =
    byId.has(nodeId) && byId.has(calc.nodeIds.P1 ?? "") && byId.has(calc.nodeIds.P2 ?? "");

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
            <b>Почему «{STATUS_TEXT[record.status].toLowerCase()}»:</b> {reason}
          </p>
        )}
      </div>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Ключевые потоки</h4>
        <table className={styles.flows}>
          <tbody>
            {productRefs.map((r) => (
              <tr key={r.ref}>
                <td>
                  {nameOf(r.ref)}
                  <span className={styles.flowRole}>{refRole(record, r.ref)}</span>
                </td>
                <td>{formatMass(shownMass(readable, r.ref), calc.view.unit)}</td>
              </tr>
            ))}
            {extraFlows.map((f) => (
              <tr key={`flow-${f.name}`}>
                <td>
                  {f.name}
                  <span className={styles.flowRole}>
                    {f.direction === "in"
                      ? "дополнительный вход"
                      : f.direction === "out"
                        ? "дополнительный выход"
                        : "поток баланса"}
                  </span>
                </td>
                <td>{formatMass(scaleForView(readable, f.massKg), calc.view.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {record.totals.residual && (
          <p className={styles.note}>
            Невязка (на 1 т сырья):{" "}
            {record.totals.residual}.
          </p>
        )}
      </section>

      {record.coefficients.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Коэффициенты</h4>
          <ul className={styles.coef}>
            {record.coefficients.map((c, i) => {
              // «кг/кг», «т/т» — доля массы: процентами понятнее.
              const share = massFraction(c);
              return (
                <li key={i}>
                  {c.indicator}
                  {c.fromRef && c.toRef ? ` (${nameOf(c.fromRef)} → ${nameOf(c.toRef)})` : ""}:{" "}
                  <b>
                    {c.valueText}
                    {c.unit && !/%/.test(c.valueText)
                      ? c.unit === "%"
                        ? "%"
                        : ` ${c.unit}`
                      : ""}
                  </b>
                  {share ? ` — ${formatPercent(share)}` : ""}
                  {c.source ? <span className={styles.sourceMeta}> · {c.source}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {record.knownData && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Свои данные</h4>
          <p className={styles.note}>{record.knownData}</p>
        </section>
      )}

      {mentionsRefs(record) && (
        <p className={`${styles.note} ${styles.legend}`}>
          В ответе модели:{" "}
          {record.refs.map((r) => `${r.ref} — ${r.ref.startsWith("P") ? nameOf(r.ref) : r.name}`).join("; ")}.
        </p>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Примечания</h4>
        <Markdown text={record.sections.notes} />
      </section>

      <section className={styles.section}>
        <details className={styles.more}>
          <summary>Расчёт по переходам</summary>
          <Markdown text={record.sections.transitions} />
        </details>
        <details className={styles.more}>
          <summary>Общий баланс участка</summary>
          <Markdown text={record.sections.balance} />
        </details>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Источники ({record.sources.length})</h4>
        {record.sources.length ? (
          record.sources.map((src) => (
            <div key={src.id} className={styles.sourceItem}>
              [{src.id}]{" "}
              {src.url ? (
                <a href={src.url} target="_blank" rel="noreferrer noopener">
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
              {src.block && (
                <details className={styles.more}>
                  <summary>Что взято из источника</summary>
                  <Markdown text={src.block} />
                </details>
              )}
            </div>
          ))
        ) : (
          <p className={styles.muted}>Модель не указала рабочих источников.</p>
        )}
      </section>

      <div className={`${styles.actions} ${styles.section}`}>
        {onShowOnGraph && (
          <button
            type="button"
            className={styles.secondary}
            onClick={onShowOnGraph}
            disabled={!byId.has(nodeId)}
          >
            Показать на графе
          </button>
        )}
        {onNewRequest && (
          <button
            type="button"
            className={styles.secondary}
            onClick={onNewRequest}
            disabled={!canRequest}
            title={
              canRequest
                ? "Спросить модель заново — с другими данными, промптом или моделью"
                : "Продуктов расчёта на графе уже нет"
            }
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
      {confirmRemove && (
        <p className={styles.note}>
          Расчёт уйдёт из графа; в базе сервера он останется, и на таком же
          преобразовании «Рассчитать» вернёт его сразу.
        </p>
      )}
    </>
  );
};
