import { useMemo, useState, type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  removeMaterialBalance,
  runMaterialBalance,
  selectBalanceTransformation,
  setBalanceActive,
  setBalanceMode,
  setMaterialBalanceView,
} from "../../store/slices/materialBalanceSlice";
import {
  allCalcs,
  flowRef,
  formatMass,
  formatWhen,
  scaleForView,
  shownMass,
  STATUS_TEXT,
  STATUS_TONE,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import type { BalanceStatus } from "../../store/api/material-balance-api";
import { useFocusNode } from "../../hooks/useFocusNode";
import { ChevronLeftIcon, ScalesIcon } from "../icons";
import { BasisFields } from "./BasisFields";
import md from "../markdown-editor/MarkdownEditor.module.css";
import styles from "./MaterialBalance.module.css";

const Status: FC<{ status: BalanceStatus }> = ({ status }) => (
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

const ROLE_TEXT: Record<string, string> = {
  basis: "исходный продукт",
  target: "целевой продукт",
  input: "вход преобразования",
  output: "выход преобразования",
};

function tookText(ms: number | null | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`;
}

/** Один расчёт целиком. */
const Details: FC<{ nodeId: string; calc: MaterialBalanceCalc }> = ({ nodeId, calc }) => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const running = useAppSelector((s) => {
    const status = s.materialBalance.jobs[nodeId]?.status;
    return status === "running" || status === "starting";
  });
  const focusNode = useFocusNode();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { record } = calc;

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  /** Подпись узла графа, а если его нет — имя из расчёта. */
  const nameOf = (ref: string) => {
    const node = byId.get(calc.nodeIds[ref]);
    return String(node?.data?.label ?? "").trim() || record.refs.find((r) => r.ref === ref)?.name || ref;
  };
  const productRefs = record.refs.filter((r) => r.ref.startsWith("P"));
  const extraFlows = record.flows.filter((f) => !flowRef(record, f.name));

  const showOnGraph = () => {
    dispatch(setBalanceMode(true));
    dispatch(selectBalanceTransformation(null));
    dispatch(setBalanceActive({ nodeId, recordId: record.id }));
    focusNode(nodeId, { zoom: 1 });
  };

  const recalc = () => {
    dispatch(setBalanceMode(true));
    dispatch(
      selectBalanceTransformation({
        transformationId: nodeId,
        basisId: calc.nodeIds.P1 ?? null,
        targetId: calc.nodeIds.P2 ?? null,
      }),
    );
    void dispatch(runMaterialBalance({ force: true }));
  };

  const canRecalc =
    byId.has(nodeId) && byId.has(calc.nodeIds.P1 ?? "") && byId.has(calc.nodeIds.P2 ?? "");

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={`${styles.linkBtn} ${styles.back}`}
        onClick={() => dispatch(setBalanceActive(null))}
      >
        <ChevronLeftIcon size={12} /> Все расчёты
      </button>

      <div className={styles.detailsHead}>
        <h3 className={styles.detailsTitle}>«{nameOf("T1")}»</h3>
        <div className={styles.itemTitle}>
          {nameOf("P1")} → {nameOf("P2")} <Status status={record.status} />
        </div>
        <div className={styles.meta}>
          {formatWhen(record.createdAt)}
          {record.model ? ` · ${record.model}` : ""}
          {calc.fromCache ? " · взят из базы" : record.tookMs ? ` · считал ${tookText(record.tookMs)}` : ""}
          {record.customPrompt ? " · свой промпт" : ""}
        </div>
        {record.nature && <div className={styles.meta}>Характер результата: {record.nature}</div>}
      </div>

      <div className={styles.basisRow}>
        <BasisFields
          view={calc.view}
          names={{ P1: nameOf("P1"), P2: nameOf("P2") }}
          onChange={(view) => dispatch(setMaterialBalanceView(nodeId, record.id, view))}
        />
      </div>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Ключевые потоки</h4>
        <table className={styles.flows}>
          <tbody>
            {productRefs.map((r) => (
              <tr key={r.ref}>
                <td>
                  {nameOf(r.ref)}
                  <span className={styles.flowRole}>
                    {ROLE_TEXT[r.role] ?? r.role}
                    {r.ref === calc.view.ref ? " · базис" : ""}
                  </span>
                </td>
                <td>{formatMass(shownMass(calc, r.ref), calc.view.unit)}</td>
              </tr>
            ))}
            {extraFlows.map((f) => (
              <tr key={`flow-${f.name}`}>
                <td>
                  {f.name}
                  <span className={styles.flowRole}>
                    {f.direction === "in" ? "дополнительный вход" : f.direction === "out" ? "дополнительный выход" : "поток баланса"}
                  </span>
                </td>
                <td>{formatMass(scaleForView(calc, f.massKg), calc.view.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(record.totals.residual || record.totals.conclusion) && (
          <p className={styles.note}>
            {record.totals.residual ? `Невязка (на 1 т исходного): ${record.totals.residual}. ` : ""}
            {record.totals.conclusion ?? ""}
          </p>
        )}
      </section>

      {record.coefficients.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Коэффициенты</h4>
          <ul className={styles.coef}>
            {record.coefficients.map((c, i) => (
              <li key={i}>
                {c.indicator}: <b>{c.valueText}{c.unit && !/%/.test(c.valueText) ? (c.unit === "%" ? "%" : ` ${c.unit}`) : ""}</b>
                {c.source ? <span className={styles.sourceMeta}> · {c.source}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {record.knownData && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Свои данные</h4>
          <p className={styles.note}>{record.knownData}</p>
        </section>
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
        <button type="button" className={styles.secondary} onClick={showOnGraph} disabled={!byId.has(nodeId)}>
          Показать на графе
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={recalc}
          disabled={!canRecalc || running}
          title={canRecalc ? "Запросить модель заново — с промптом и моделью из плашки над полотном" : "Продуктов расчёта на графе уже нет"}
        >
          {running ? "Считаем…" : "Пересчитать"}
        </button>
        {confirmRemove ? (
          <>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => dispatch(removeMaterialBalance(nodeId, record.id))}
            >
              Да, убрать
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirmRemove(false)}>
              Отмена
            </button>
          </>
        ) : (
          <button type="button" className={styles.dangerBtn} onClick={() => setConfirmRemove(true)}>
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
    </div>
  );
};

/**
 * Вкладка «Материальный баланс» левой панели: расчёты графа по
 * преобразованиям и один расчёт целиком. Открытый расчёт — тот, чьи числа
 * на узлах в режиме «Материальный баланс».
 */
export const MaterialBalanceSection: FC = () => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const { active, selection } = useAppSelector((s) => s.materialBalance);
  const focusNode = useFocusNode();
  const list = useMemo(() => allCalcs(nodes), [nodes]);

  const opened = active
    ? list.find((x) => x.nodeId === active.nodeId && x.calc.record.id === active.recordId)
    : undefined;
  if (opened) return <Details nodeId={opened.nodeId} calc={opened.calc} />;

  if (!list.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Расчётов материального баланса на этом графе пока нет. Включите
          «Материальный баланс» над полотном и щёлкните преобразование — модель
          найдёт источники и посчитает, сколько продукта получается из сырья.
        </div>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => dispatch(setBalanceMode(true))}
        >
          Включить режим «Материальный баланс»
        </button>
      </div>
    );
  }

  const groups = new Map<string, { label: string; items: MaterialBalanceCalc[] }>();
  for (const { nodeId, calc } of list) {
    const node = nodes.find((n) => n.id === nodeId);
    const g = groups.get(nodeId) ?? {
      label: String(node?.data?.label ?? calc.record.transformation),
      items: [],
    };
    g.items.push(calc);
    groups.set(nodeId, g);
  }
  const labelOf = (calc: MaterialBalanceCalc, ref: string) =>
    String(nodes.find((n) => n.id === calc.nodeIds[ref])?.data?.label ?? "").trim() ||
    calc.record.refs.find((r) => r.ref === ref)?.name ||
    ref;

  const open = (nodeId: string, calc: MaterialBalanceCalc) => {
    dispatch(setBalanceActive({ nodeId, recordId: calc.record.id }));
    // Выбрано преобразование в режиме — пусть плашка и узлы покажут то же.
    if (selection) {
      dispatch(
        selectBalanceTransformation({
          transformationId: nodeId,
          basisId: calc.nodeIds.P1 ?? null,
          targetId: calc.nodeIds.P2 ?? null,
        }),
      );
    }
  };

  return (
    <div className={styles.panel}>
      <p className={styles.muted}>
        Расчёты этого графа по преобразованиям. В режиме «Материальный баланс»
        на узлах — числа открытого расчёта, по умолчанию последнего.
      </p>
      {[...groups].map(([nodeId, g]) => (
        <div key={nodeId} className={styles.group}>
          <button
            type="button"
            className={styles.groupHead}
            onClick={() => focusNode(nodeId, { zoom: 1 })}
            title="Показать преобразование на графе"
          >
            <ScalesIcon size={15} /> {g.label}
          </button>
          {g.items.map((calc) => (
            <button
              key={calc.record.id}
              type="button"
              className={styles.item}
              onClick={() => open(nodeId, calc)}
            >
              <span className={styles.itemTitle}>
                {labelOf(calc, "P1")} → {labelOf(calc, "P2")}
                <Status status={calc.record.status} />
              </span>
              <span className={styles.meta}>
                {formatWhen(calc.record.createdAt)}
                {calc.record.model ? ` · ${calc.record.model}` : ""}
                {calc.fromCache ? " · из базы" : ""}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
