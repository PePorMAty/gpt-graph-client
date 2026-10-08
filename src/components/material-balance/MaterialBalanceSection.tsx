import { useEffect, useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  balanceRequestOf,
  cancelMaterialBalance,
  dismissBalanceJob,
  draftAmounts,
  newCalcFrom,
  openBalanceCalc,
  openBalanceProduct,
  pickBalanceTransformation,
  setBalanceActive,
  setBalanceMode,
  setDraftAmount,
  setDraftTargets,
  setMaterialBalanceAmounts,
} from "../../store/slices/materialBalanceSlice";
import {
  allCalcs,
  amountsOf,
  balanceEnds,
  calcKey,
  calcProductsLabel,
  calcsOf,
  computeBalance,
  formatMass,
  formatWhen,
  inputRefs,
  targetRefs,
  targetsKey,
  type BalanceInputAmount,
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
import { ProductDetails } from "./ProductDetails";
import { CalcScheme, FormScheme } from "./TransformationScheme";
import { RequestForm } from "./RequestForm";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const busy = (status: string | undefined) => status === "running" || status === "starting";

const HINT =
  "Выберите преобразование на полотне — посчитаем его материальный баланс: сколько каждого продукта получится из сырья.";

/** Подпись узла по id — по текущему графу. */
function useLabelOf() {
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  return useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (id: string | undefined) => label(byId.get(id ?? ""));
  }, [nodes]);
}

/**
 * Выбранное преобразование: его расчёты, ход идущих, схема с количеством
 * сырья и продуктами, форма нового расчёта, общий расчёт или расчёт
 * продукта.
 */
const SelectedView: FC<{ t: CustomNode }> = ({ t }) => {
  const dispatch = useAppDispatch();
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const { selection, jobs, draft } = useAppSelector((s) => s.materialBalance);
  const focusNode = useFocusNode();
  const labelOf = useLabelOf();
  const [now, setNow] = useState(() => Date.now());

  const ends = useMemo(() => balanceEnds(t.id, nodes, edges), [t.id, nodes, edges]);
  const calcs = calcsOf(t);
  const calc = calcs.find((c) => c.record.id === selection?.recordId);
  const tJobs = Object.entries(jobs).filter(([, j]) => j.transformationId === t.id);
  const running = tJobs.some(([, j]) => busy(j.status));
  const productId = calc ? selection?.productId ?? null : null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Что на экране, то и на узлах после снятия выбора.
  useEffect(() => {
    if (calc) dispatch(setBalanceActive({ nodeId: t.id, recordId: calc.record.id }));
  }, [dispatch, t.id, calc]);

  const back = () => {
    dispatch(pickBalanceTransformation(null));
    dispatch(setBalanceActive(null));
  };

  const title = (c: MaterialBalanceCalc) => calcProductsLabel(c, labelOf);

  // Форма нового расчёта.
  const req = balanceRequestOf({ nodes, edges, draft }, t.id);
  const formAmounts = draftAmounts(draft);
  const formKey = targetsKey(req.targets.map((n) => n.id));
  const sameTargets = calcs.find((c) => calcKey(c) === formKey);

  // Сырьё на графе, которого нет в открытом расчёте: связь нарисовали позже.
  const missingInputs = calc
    ? ends.ins.filter((n) => !inputRefs(calc.record).some((r) => calc.nodeIds[r.ref] === n.id))
    : [];

  const onCalcAmount = (c: MaterialBalanceCalc) => (ref: string, value: BalanceInputAmount) =>
    dispatch(setMaterialBalanceAmounts(t.id, c.record.id, { ...amountsOf(c), [ref]: value }));

  return (
    <div className={styles.panel}>
      <button type="button" className={`${styles.linkBtn} ${styles.back}`} onClick={back}>
        <ChevronLeftIcon size={12} /> Все расчёты
      </button>
      <h3 className={styles.detailsTitle}>«{label(t)}»</h3>

      {calcs.length > 0 && (
        <div className={styles.pairs}>
          <span className={styles.fieldLabel}>Расчёты преобразования</span>
          {calcs.map((c) => {
            const on = c === calc;
            return (
              <button
                key={c.record.id}
                type="button"
                className={`${styles.chipBtn} ${on ? styles.chipBtnOn : ""}`}
                aria-pressed={on}
                onClick={() => dispatch(openBalanceCalc(c.record.id))}
              >
                → {title(c)}
              </button>
            );
          })}
          <button
            type="button"
            className={`${styles.chipBtn} ${!calc ? styles.chipBtnOn : ""}`}
            aria-pressed={!calc}
            onClick={() => dispatch(openBalanceCalc(null))}
          >
            + Новый расчёт
          </button>
        </div>
      )}

      {tJobs.map(([key, job]) => {
        const what = job.targetIds.map((id) => labelOf(id)).filter(Boolean).join(", ");
        return busy(job.status) ? (
          <div key={key} className={styles.running} role="status">
            <span className={styles.spinner} aria-hidden />
            <div className={styles.runningBody}>
              <span>
                Считаем «→ {what}»… {elapsed(now - new Date(job.startedAt).getTime())}.
                Модель ищет источники — обычно это несколько минут. Можно закрыть
                панель и работать дальше: по готовности придёт уведомление.
              </span>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => dispatch(cancelMaterialBalance(key))}
              >
                Отменить расчёт
              </button>
            </div>
          </div>
        ) : (
          <div key={key} className={styles.errorBox}>
            <span>
              «→ {what}» не рассчитан: {job.error}
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => dispatch(dismissBalanceJob(key))}
              aria-label="Скрыть ошибку"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        );
      })}

      {calc ? (
        productId ? (
          <ProductDetails
            transformation={t}
            calc={calc}
            productId={productId}
            labelOf={labelOf}
            onAmount={onCalcAmount(calc)}
            onBack={() => dispatch(openBalanceProduct(null))}
            calcTitle={title(calc)}
          />
        ) : (
          <>
            {missingInputs.length > 0 && (
              <p className={styles.warn}>
                У преобразования на графе есть сырьё, которого нет в этом расчёте:{" "}
                {missingInputs.map((n) => `«${label(n)}»`).join(", ")}. Чтобы оно вошло в
                баланс, посчитайте заново.
              </p>
            )}
            <CalcScheme
              transformation={t}
              result={computeBalance(calc)}
              labelOf={labelOf}
              onAmount={onCalcAmount(calc)}
              onProduct={(id) => dispatch(openBalanceProduct(id))}
            />
            <p className={styles.muted}>
              Количество любого сырья можно менять — массы пересчитаются сразу, без
              модели. Щелчок по продукту — его подробный расчёт.
            </p>
            <CalcDetails
              nodeId={t.id}
              calc={calc}
              labelOf={labelOf}
              onNewRequest={() => dispatch(newCalcFrom(calc, amountsOf(calc)))}
              onShowOnGraph={() => focusNode(t.id, { zoom: 1 })}
            />
          </>
        )
      ) : !ends.ins.length || !ends.outs.length ? (
        <p className={styles.warn}>
          У преобразования нет продукта {!ends.ins.length ? "на входе" : "на выходе"} —
          баланс считать не из чего. Свяжите его с продуктом и выберите снова.
        </p>
      ) : (
        <>
          <FormScheme
            transformation={t}
            ins={ends.ins}
            outs={ends.outs}
            amounts={formAmounts}
            onAmount={(inputId, v) =>
              dispatch(
                setDraftAmount({
                  inputId,
                  amount: { amount: v.amount === null ? "" : String(v.amount).replace(".", ","), unit: v.unit },
                }),
              )
            }
            targets={draft.targets}
            onTargets={(ids) => dispatch(setDraftTargets(ids))}
          />
          <RequestForm
            transformation={t}
            ins={ends.ins}
            targets={req.targets}
            hasBasis={Boolean(req.basis)}
            existing={sameTargets}
            onCancel={calcs.length ? () => dispatch(openBalanceCalc(calcs[0].record.id)) : undefined}
          />
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
  const labelOf = useLabelOf();
  const list = useMemo(() => allCalcs(nodes), [nodes]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const groups = new Map<string, { label: string; items: MaterialBalanceCalc[] }>();
  for (const { nodeId, calc } of list) {
    const g = groups.get(nodeId) ?? {
      label: labelOf(nodeId) || calc.record.transformation,
      items: [],
    };
    g.items.push(calc);
    groups.set(nodeId, g);
  }

  const toggle = (nodeId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  // Расчёт из списка открывается так же, как выбранное на полотне
  // преобразование; продукт — сразу своим расчётом.
  const openCalc = (nodeId: string, calc: MaterialBalanceCalc, productId?: string) => {
    dispatch(pickBalanceTransformation(nodeId, { recordId: calc.record.id, productId }));
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
            Расчёты по преобразованиям: «преобразование → продукты, для которых
            посчитано». Щелчок по продукту — его подробный расчёт.
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
                  g.items.map((calc) => {
                    const res = computeBalance(calc);
                    return (
                      <div key={calc.record.id} className={styles.item}>
                        <button
                          type="button"
                          className={styles.itemOpen}
                          onClick={() => openCalc(nodeId, calc)}
                        >
                          <span className={styles.itemTitle}>
                            {g.label} → {calcProductsLabel(calc, labelOf)}
                            <Status status={calc.record.status} />
                          </span>
                          <span className={styles.meta}>
                            {formatWhen(calc.record.createdAt)}
                            {calc.record.model ? ` · ${calc.record.model}` : ""}
                            {calc.fromCache ? " · из базы" : ""}
                          </span>
                        </button>
                        <div className={styles.itemProducts}>
                          {targetRefs(calc.record).map((r) => {
                            const f = res.targets.find((x) => x.ref === r.ref);
                            const id = calc.nodeIds[r.ref];
                            const name = labelOf(id) || r.name;
                            return (
                              <button
                                key={r.ref}
                                type="button"
                                className={styles.chipBtn}
                                disabled={!labelOf(id)}
                                onClick={() => openCalc(nodeId, calc, id)}
                                title={labelOf(id) ? "Подробный расчёт этого продукта" : "Этого продукта на графе уже нет"}
                              >
                                {name} · {formatMass(f?.mass ?? null, f?.unit ?? res.unit)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
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
 * преобразование — здесь, с формой запроса или готовым расчётом; ничего не
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
