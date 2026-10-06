import { useEffect, useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  chooseBalanceDirection,
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
  DIRECTION_ARROW,
  DIRECTION_TEXT,
  DIRECTIONS,
  directionOf,
  formatWhen,
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

const HINT =
  "Выберите преобразование на полотне — посчитаем его материальный баланс: сколько продукта получается из сырья или сколько сырья нужно на продукт.";

/**
 * Выбранное преобразование: вкладки направлений, схема пары с количеством,
 * ход расчёта, форма запроса или данные расчёта.
 */
const SelectedView: FC<{ t: CustomNode }> = ({ t }) => {
  const dispatch = useAppDispatch();
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const { selection, direction, formOpen, jobs, draft } = useAppSelector(
    (s) => s.materialBalance,
  );
  const focusNode = useFocusNode();
  const [now, setNow] = useState(() => Date.now());

  const ends = useMemo(() => balanceEnds(t.id, nodes, edges), [t.id, nodes, edges]);
  const input = ends.ins.find((n) => n.id === selection?.inputId);
  const output = ends.outs.find((n) => n.id === selection?.outputId);
  const job = jobs[jobKey(t.id, direction)];
  const running = job?.status === "running" || job?.status === "starting";
  // Расчёт направления — любой пары; на экране он, если пара та же.
  const existing = calcFor(t, direction);
  const shown =
    existing && existing.nodeIds.P1 === input?.id && existing.nodeIds.P2 === output?.id
      ? existing
      : undefined;
  const showDetails = Boolean(shown) && !formOpen;
  const shownId = shown?.record.id;

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
    showDetails && shown ? shown.view : { amount: draftAmount(draft.amount), unit: draft.unit };
  const onView = (v: BalanceView) =>
    showDetails && shown
      ? dispatch(setMaterialBalanceView(t.id, shown.record.id, v))
      : dispatch(setBalanceDraft({ amount: String(v.amount), unit: v.unit }));

  // «Отмена» формы: снова данные расчёта — его пары.
  const cancel = existing
    ? () => {
        const pairOk =
          ends.ins.some((n) => n.id === existing.nodeIds.P1) &&
          ends.outs.some((n) => n.id === existing.nodeIds.P2);
        if (pairOk) {
          dispatch(
            setBalancePair({ inputId: existing.nodeIds.P1, outputId: existing.nodeIds.P2 }),
          );
        }
        dispatch(setBalanceFormOpen(false));
      }
    : undefined;

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
          <div className={styles.dirTabs} role="tablist" aria-label="Направление расчёта">
            {DIRECTIONS.map((d) => {
              const has = Boolean(calcFor(t, d));
              const busy = ["running", "starting"].includes(jobs[jobKey(t.id, d)]?.status ?? "");
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === direction}
                  className={`${styles.dirTab} ${d === direction ? styles.dirTabOn : ""}`}
                  onClick={() => dispatch(chooseBalanceDirection(d))}
                  title={
                    d === "down"
                      ? "Сколько продукта получится из заданного количества сырья"
                      : "Сколько сырья нужно на заданное количество продукта"
                  }
                >
                  <span className={styles.dirArrow} aria-hidden>
                    {DIRECTION_ARROW[d]}
                  </span>
                  {DIRECTION_TEXT[d]}
                  {busy ? (
                    <span className={styles.spinner} aria-label="считается" />
                  ) : has ? (
                    <span className={styles.dirDone} aria-label="есть расчёт">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <PairScheme
            transformation={t}
            ins={ends.ins}
            outs={ends.outs}
            input={input}
            output={output}
            direction={direction}
            view={view}
            onView={onView}
            calc={showDetails ? shown : undefined}
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
                onClick={() => dispatch(dismissBalanceJob(jobKey(t.id, direction)))}
                aria-label="Скрыть ошибку"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {showDetails && shown ? (
            <CalcDetails
              nodeId={t.id}
              calc={shown}
              onNewRequest={() => dispatch(setBalanceFormOpen(true))}
              onShowOnGraph={() => focusNode(t.id, { zoom: 1 })}
            />
          ) : input && output ? (
            <RequestForm
              transformation={t}
              input={input}
              output={output}
              direction={direction}
              existing={existing}
              nameOf={nameOf}
              onCancel={cancel}
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

  const groups = new Map<string, { label: string; items: MaterialBalanceCalc[] }>();
  for (const { nodeId, calc } of list) {
    const g = groups.get(nodeId) ?? {
      label: label(nodes.find((n) => n.id === nodeId)) || calc.record.transformation,
      items: [],
    };
    g.items.push(calc);
    groups.set(nodeId, g);
  }
  // Внутри группы — сначала «вниз», потом «вверх».
  for (const g of groups.values()) {
    g.items.sort((a, b) => DIRECTIONS.indexOf(directionOf(a)) - DIRECTIONS.indexOf(directionOf(b)));
  }
  const labelOf = (calc: MaterialBalanceCalc, ref: string) =>
    label(nodes.find((n) => n.id === calc.nodeIds[ref])) ||
    calc.record.refs.find((r) => r.ref === ref)?.name ||
    ref;

  const toggle = (nodeId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  // Расчёт из списка открывается так же, как выбранное на полотне
  // преобразование: его направление, его пара, его данные.
  const openCalc = (nodeId: string, calc: MaterialBalanceCalc) => {
    dispatch(
      selectBalanceTransformation({
        transformationId: nodeId,
        inputId: calc.nodeIds.P1 ?? null,
        outputId: calc.nodeIds.P2 ?? null,
        direction: directionOf(calc),
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
            Расчёты по преобразованиям — у каждого не больше двух: вниз (из
            сырья) и вверх (на продукт).
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
                    <span className={styles.groupDirs} aria-label="направления расчётов">
                      {g.items.map((c) => DIRECTION_ARROW[directionOf(c)]).join(" ")}
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
                  g.items.map((calc) => {
                    const d = directionOf(calc);
                    return (
                      <button
                        key={calc.record.id}
                        type="button"
                        className={styles.item}
                        onClick={() => openCalc(nodeId, calc)}
                      >
                        <span className={styles.itemTitle}>
                          <span className={styles.itemDir}>
                            {DIRECTION_ARROW[d]} {d === "up" ? "Вверх" : "Вниз"}
                          </span>
                          {d === "up"
                            ? `${labelOf(calc, "P2")} ← ${labelOf(calc, "P1")}`
                            : `${labelOf(calc, "P1")} → ${labelOf(calc, "P2")}`}
                          <Status status={calc.record.status} />
                        </span>
                        <span className={styles.meta}>
                          {formatWhen(calc.record.createdAt)}
                          {calc.record.model ? ` · ${calc.record.model}` : ""}
                          {calc.fromCache ? " · из базы" : ""}
                        </span>
                      </button>
                    );
                  })}
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
 * преобразование — здесь, с вкладками направлений, формой запроса или
 * готовыми данными; ничего не выбрано — подсказка и все расчёты графа. Та же
 * вкладка открывается и с левого рельса.
 */
export const MaterialBalanceSection: FC = () => {
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const selection = useAppSelector((s) => s.materialBalance.selection);
  const t = selection
    ? nodes.find((n) => n.id === selection.transformationId && n.type === "transformation")
    : undefined;
  return t ? <SelectedView key={t.id} t={t} /> : <ListView />;
};
