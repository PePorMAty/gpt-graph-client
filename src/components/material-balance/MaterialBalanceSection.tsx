import { useEffect, useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  dismissBalanceJob,
  selectBalanceTransformation,
  setBalanceActive,
  setBalanceFormOpen,
  setBalanceMode,
  setBalancePair,
} from "../../store/slices/materialBalanceSlice";
import {
  allCalcs,
  balanceEnds,
  calcsOf,
  formatWhen,
  shownCalcFor,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { useFocusNode } from "../../hooks/useFocusNode";
import { ChevronLeftIcon, CloseIcon, ScalesIcon } from "../icons";
import { CalcDetails, Status } from "./CalcDetails";
import { RequestForm } from "./RequestForm";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const HINT =
  "Выберите преобразование на полотне — посчитаем его материальный баланс: сколько продукта получается из сырья.";

/** Выбранное преобразование: пара, ход расчёта, форма запроса или данные. */
const SelectedView: FC<{ t: CustomNode }> = ({ t }) => {
  const dispatch = useAppDispatch();
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const { selection, active, formOpen, jobs } = useAppSelector((s) => s.materialBalance);
  const focusNode = useFocusNode();
  const [now, setNow] = useState(() => Date.now());

  const ends = useMemo(() => balanceEnds(t.id, nodes, edges), [t.id, nodes, edges]);
  const basis = ends.ins.find((n) => n.id === selection?.basisId);
  const target = ends.outs.find((n) => n.id === selection?.targetId);
  const job = jobs[t.id];
  const running = job?.status === "running" || job?.status === "starting";
  const shown = shownCalcFor({ nodes, selection, active });
  const pairCalcs = calcsOf(t).filter(
    (c) => c.nodeIds.P1 === basis?.id && c.nodeIds.P2 === target?.id,
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const back = () => {
    dispatch(selectBalanceTransformation(null));
    dispatch(setBalanceActive(null));
  };

  const pairSelect = (
    list: CustomNode[],
    value: string | undefined,
    onChange: (id: string) => void,
    aria: string,
  ) =>
    list.length > 1 ? (
      <select
        className={styles.select}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={aria}
        disabled={running}
      >
        {list.map((n) => (
          <option key={n.id} value={n.id}>
            {label(n)}
          </option>
        ))}
      </select>
    ) : (
      <span className={styles.pairName}>{label(list[0])}</span>
    );

  return (
    <div className={styles.panel}>
      <button type="button" className={`${styles.linkBtn} ${styles.back}`} onClick={back}>
        <ChevronLeftIcon size={12} /> Все расчёты
      </button>
      <h3 className={styles.detailsTitle}>«{label(t)}»</h3>

      {!ends.ins.length || !ends.outs.length ? (
        <p className={styles.warn}>
          У преобразования нет продукта {!ends.ins.length ? "на входе" : "на выходе"} —
          баланс считать не из чего. Свяжите его с продуктом и выберите снова.
        </p>
      ) : (
        <>
          <div className={styles.pairRows}>
            <span className={styles.fieldLabel}>Исходный продукт</span>
            {pairSelect(ends.ins, basis?.id, (id) => dispatch(setBalancePair({ basisId: id })), "Исходный продукт")}
            <span className={styles.fieldLabel}>Целевой продукт</span>
            {pairSelect(ends.outs, target?.id, (id) => dispatch(setBalancePair({ targetId: id })), "Целевой продукт")}
          </div>

          {running && job && (
            <div className={styles.running} role="status">
              <span className={styles.spinner} aria-hidden />
              <span>
                Считаем… {elapsed(now - new Date(job.startedAt).getTime())}. Модель
                ищет источники — обычно это несколько минут. Можно закрыть панель
                и работать дальше: по готовности придёт уведомление.
              </span>
            </div>
          )}
          {job?.status === "failed" && (
            <div className={styles.errorBox}>
              <span>Не рассчитан: {job.error}</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => dispatch(dismissBalanceJob(t.id))}
                aria-label="Скрыть ошибку"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {basis && target && shown && !formOpen ? (
            <>
              {pairCalcs.length > 1 && (
                <div className={styles.calcSwitch}>
                  <span className={styles.fieldLabel}>Расчёты этой пары</span>
                  {pairCalcs.map((c) => (
                    <button
                      key={c.record.id}
                      type="button"
                      className={`${styles.chipBtn} ${c.record.id === shown.calc.record.id ? styles.chipBtnOn : ""}`}
                      onClick={() => dispatch(setBalanceActive({ nodeId: t.id, recordId: c.record.id }))}
                      aria-pressed={c.record.id === shown.calc.record.id}
                    >
                      {formatWhen(c.record.createdAt)}
                      {c.record.model ? ` · ${c.record.model}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <CalcDetails
                nodeId={t.id}
                calc={shown.calc}
                onNewRequest={() => dispatch(setBalanceFormOpen(true))}
                onShowOnGraph={() => focusNode(t.id, { zoom: 1 })}
              />
            </>
          ) : basis && target ? (
            <RequestForm
              transformationId={t.id}
              basis={basis}
              target={target}
              hasCalc={Boolean(shown)}
              onCancel={shown ? () => dispatch(setBalanceFormOpen(false)) : undefined}
            />
          ) : null}
        </>
      )}
    </div>
  );
};

/** Все расчёты графа по преобразованиям. */
const ListView: FC = () => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const mode = useAppSelector((s) => s.materialBalance.mode);
  const focusNode = useFocusNode();
  const list = useMemo(() => allCalcs(nodes), [nodes]);

  const groups = new Map<string, { label: string; items: MaterialBalanceCalc[] }>();
  for (const { nodeId, calc } of list) {
    const g = groups.get(nodeId) ?? {
      label: label(nodes.find((n) => n.id === nodeId)) || calc.record.transformation,
      items: [],
    };
    g.items.push(calc);
    groups.set(nodeId, g);
  }
  const labelOf = (calc: MaterialBalanceCalc, ref: string) =>
    label(nodes.find((n) => n.id === calc.nodeIds[ref])) ||
    calc.record.refs.find((r) => r.ref === ref)?.name ||
    ref;

  // Расчёт из списка открывается так же, как выбранное на полотне
  // преобразование: его пара, его данные.
  const open = (nodeId: string, calc: MaterialBalanceCalc) => {
    dispatch(
      selectBalanceTransformation({
        transformationId: nodeId,
        basisId: calc.nodeIds.P1 ?? null,
        targetId: calc.nodeIds.P2 ?? null,
      }),
    );
    dispatch(setBalanceActive({ nodeId, recordId: calc.record.id }));
  };

  return (
    <div className={styles.panel}>
      {mode ? (
        <div className={styles.hintBox}>
          <ScalesIcon size={18} className={styles.barIcon} />
          <span>{HINT}</span>
        </div>
      ) : (
        <div className={styles.hintBox}>
          <span>
            Включите «Материальный баланс» над полотном: выбирать преобразования
            для расчёта и видеть массы на узлах.
          </span>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => dispatch(setBalanceMode(true))}
          >
            Включить
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className={styles.empty}>
          Расчётов материального баланса на этом графе пока нет.
        </div>
      ) : (
        <>
          <p className={styles.muted}>
            Расчёты графа по преобразованиям. На узлах — числа открытого
            расчёта, по умолчанию последнего.
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
        </>
      )}
    </div>
  );
};

/**
 * Вкладка «Материальный баланс» левой панели.
 *
 * Чип над полотном открывает её и включает режим: выбранное на полотне
 * преобразование — здесь, с формой запроса или готовыми данными; ничего не
 * выбрано — подсказка и все расчёты графа. Та же вкладка открывается и с
 * левого рельса.
 */
export const MaterialBalanceSection: FC = () => {
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const selection = useAppSelector((s) => s.materialBalance.selection);
  const t = selection
    ? nodes.find((n) => n.id === selection.transformationId && n.type === "transformation")
    : undefined;
  return t ? <SelectedView key={t.id} t={t} /> : <ListView />;
};
