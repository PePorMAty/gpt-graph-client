import { useEffect, useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  dismissBalanceJob,
  draftAmount,
  jobKey,
  selectBalanceTransformation,
  setBalanceActive,
  setBalanceDraft,
  setBalanceFormOpen,
  setBalanceMode,
  setBalancePair,
  setMaterialBalanceView,
} from "../../store/slices/materialBalanceSlice";
import {
  allCalcs,
  balanceEnds,
  calcFor,
  calcsOf,
  formatWhen,
  pairFor,
  type BalanceView,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { useFocusNode } from "../../hooks/useFocusNode";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FocusIcon,
  ScalesIcon,
} from "../icons";
import { CalcDetails, Status } from "./CalcDetails";
import { PairScheme } from "./PairScheme";
import { RequestForm } from "./RequestForm";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const busy = (status: string | undefined) => status === "running" || status === "starting";

const HINT =
  "Выберите преобразование на полотне — посчитаем его материальный баланс: сколько продукта получается из сырья.";

/**
 * Выбранное преобразование: его сырьё и продукты, посчитанные пары, схема
 * пары с количеством, ход расчёта, форма запроса или данные расчёта.
 */
const SelectedView: FC<{ t: CustomNode }> = ({ t }) => {
  const dispatch = useAppDispatch();
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const { selection, formOpen, jobs, draft } = useAppSelector((s) => s.materialBalance);
  const focusNode = useFocusNode();
  const [now, setNow] = useState(() => Date.now());

  const ends = useMemo(() => balanceEnds(t.id, nodes, edges), [t.id, nodes, edges]);
  const inputId = selection?.inputId ?? "";
  const outputId = selection?.outputId ?? "";
  const input = ends.ins.find((n) => n.id === inputId);
  const output = ends.outs.find((n) => n.id === outputId);
  const job = jobs[jobKey(t.id, inputId, outputId)];
  const running = busy(job?.status);
  const existing = calcFor(t, inputId, outputId);
  // Пара расчёта на графе уже не «сырьё → продукт» этого преобразования:
  // продукт удалён или связь теперь нарисована иначе.
  const stale = Boolean(existing) && (!input || !output);
  const showDetails = Boolean(existing) && (!formOpen || stale);
  const shownId = showDetails ? existing?.record.id : undefined;
  const calcs = calcsOf(t);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Что на экране, то и на узлах после снятия выбора.
  useEffect(() => {
    if (shownId !== undefined) dispatch(setBalanceActive({ nodeId: t.id, recordId: shownId }));
  }, [dispatch, t.id, shownId]);

  const back = () => {
    dispatch(selectBalanceTransformation(null));
    dispatch(setBalanceActive(null));
  };

  const nameOf = (id: string | undefined) =>
    label(nodes.find((n) => n.id === id)) || "продукт не на графе";

  // Количество: у открытого расчёта — его, у формы — черновик.
  const view: BalanceView =
    showDetails && existing
      ? existing.view
      : { amount: draftAmount(draft.amount), unit: draft.unit };
  const onView = (v: BalanceView) =>
    showDetails && existing
      ? dispatch(setMaterialBalanceView(t.id, existing.record.id, v))
      : dispatch(setBalanceDraft({ amount: String(v.amount), unit: v.unit }));

  return (
    <div className={styles.panel}>
      <button type="button" className={`${styles.linkBtn} ${styles.back}`} onClick={back}>
        <ChevronLeftIcon size={12} /> Все расчёты
      </button>
      <h3 className={styles.detailsTitle}>«{label(t)}»</h3>
      <div className={styles.roles}>
        <span>
          <b>Сырьё:</b> {ends.ins.map((n) => label(n)).join(", ") || "нет"}
        </span>
        <span>
          <b>Продукты:</b> {ends.outs.map((n) => label(n)).join(", ") || "нет"}
        </span>
      </div>

      {calcs.length > 0 && (
        <div className={styles.pairs}>
          <span className={styles.fieldLabel}>Посчитанные пары</span>
          {calcs.map((c) => {
            const on = c.nodeIds.P1 === inputId && c.nodeIds.P2 === outputId;
            return (
              <button
                key={c.record.id}
                type="button"
                className={`${styles.chipBtn} ${on ? styles.chipBtnOn : ""}`}
                aria-pressed={on}
                onClick={() =>
                  dispatch(
                    selectBalanceTransformation({
                      transformationId: t.id,
                      inputId: c.nodeIds.P1 ?? null,
                      outputId: c.nodeIds.P2 ?? null,
                    }),
                  )
                }
              >
                {nameOf(c.nodeIds.P1)} → {nameOf(c.nodeIds.P2)}
              </button>
            );
          })}
        </div>
      )}

      {!ends.ins.length || !ends.outs.length ? (
        <p className={styles.warn}>
          У преобразования нет продукта {!ends.ins.length ? "на входе" : "на выходе"} —
          баланс считать не из чего. Свяжите его с продуктом и выберите снова.
        </p>
      ) : stale && existing ? (
        <>
          <div className={styles.warn}>
            Пара этого расчёта — «{nameOf(existing.nodeIds.P1)} → {nameOf(existing.nodeIds.P2)}» —
            на графе уже не «сырьё → продукт» «{label(t)}»: продукт удалён или
            связь нарисована иначе. Данные расчёта — ниже.{" "}
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => dispatch(selectBalanceTransformation(pairFor(t.id, nodes, edges)))}
            >
              Выбрать пару заново
            </button>
          </div>
          <CalcDetails nodeId={t.id} calc={existing} />
        </>
      ) : (
        <>
          <PairScheme
            transformation={t}
            ins={ends.ins}
            outs={ends.outs}
            input={input}
            output={output}
            view={view}
            onView={onView}
            calc={showDetails ? existing : undefined}
            onPair={(pair) => dispatch(setBalancePair(pair))}
            disabled={running}
          />

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
                onClick={() => dispatch(dismissBalanceJob(jobKey(t.id, inputId, outputId)))}
                aria-label="Скрыть ошибку"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {showDetails && existing ? (
            <CalcDetails
              nodeId={t.id}
              calc={existing}
              onNewRequest={() => dispatch(setBalanceFormOpen(true))}
              onShowOnGraph={() => focusNode(t.id, { zoom: 1 })}
            />
          ) : input && output ? (
            <RequestForm
              transformation={t}
              input={input}
              output={output}
              existing={existing}
              onCancel={existing ? () => dispatch(setBalanceFormOpen(false)) : undefined}
            />
          ) : null}
        </>
      )}
    </div>
  );
};

/** Все расчёты графа: раскрывающиеся группы по преобразованиям. */
const ListView: FC = () => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const mode = useAppSelector((s) => s.materialBalance.mode);
  const focusNode = useFocusNode();
  const list = useMemo(() => allCalcs(nodes), [nodes]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const labelOf = (calc: MaterialBalanceCalc, ref: string) =>
    label(nodes.find((n) => n.id === calc.nodeIds[ref])) ||
    calc.record.refs.find((r) => r.ref === ref)?.name ||
    ref;
  const pairName = (c: MaterialBalanceCalc) => `${labelOf(c, "P1")} → ${labelOf(c, "P2")}`;

  const groups = new Map<string, { label: string; items: MaterialBalanceCalc[] }>();
  for (const { nodeId, calc } of list) {
    const g = groups.get(nodeId) ?? {
      label: label(nodes.find((n) => n.id === nodeId)) || calc.record.transformation,
      items: [],
    };
    g.items.push(calc);
    groups.set(nodeId, g);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => pairName(a).localeCompare(pairName(b), "ru"));
  }

  const toggle = (nodeId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  // Расчёт из списка открывается так же, как выбранное на полотне
  // преобразование: его пара, его данные.
  const openCalc = (nodeId: string, calc: MaterialBalanceCalc) => {
    dispatch(
      selectBalanceTransformation({
        transformationId: nodeId,
        inputId: calc.nodeIds.P1 ?? null,
        outputId: calc.nodeIds.P2 ?? null,
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
            Расчёты по преобразованиям — по одному на пару «сырьё → продукт».
          </p>
          {[...groups].map(([nodeId, g]) => {
            const expanded = open.has(nodeId);
            return (
              <div key={nodeId} className={styles.group}>
                <div className={styles.groupHeadRow}>
                  <button
                    type="button"
                    className={styles.groupHead}
                    onClick={() => toggle(nodeId)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                    <ScalesIcon size={15} />
                    <span className={styles.groupName}>{g.label}</span>
                    <span className={styles.groupCount} aria-label="расчётов">
                      {g.items.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => focusNode(nodeId, { zoom: 1 })}
                    title="Показать преобразование на графе"
                    aria-label={`Показать «${g.label}» на графе`}
                  >
                    <FocusIcon size={15} />
                  </button>
                </div>
                {expanded &&
                  g.items.map((calc) => (
                    <button
                      key={calc.record.id}
                      type="button"
                      className={styles.item}
                      onClick={() => openCalc(nodeId, calc)}
                    >
                      <span className={styles.itemTitle}>
                        {pairName(calc)}
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
            );
          })}
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
