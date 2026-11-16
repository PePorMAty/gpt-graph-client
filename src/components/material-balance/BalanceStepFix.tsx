// src/components/material-balance/BalanceStepFix.tsx
//
// «Исправить шаг» из отказа расчёта баланса («Некорректный выбор»).
//
// Модель баланса пишет в примечаниях, что не так («из этилцеллозольва и
// уксусной кислоты получают этилцеллозольвацетат, а не этилацетат»), но
// исправлять приходилось руками: найти узел, переименовать, поправить
// описание. Проверка шага (store/api/step-check-api.ts) берёт её примечания
// замечанием и возвращает готовые переименования; человек видит их до
// применения. Продукты, связанные с другими шагами графа, не
// переименовываются: их правка поменяла бы смысл и тех шагов.

import { useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateNodeData } from "../../store/slices/gptSlice";
import { checkStep, StepCheckUnsupported, type StepCheckResult } from "../../store/api/step-check-api";
import type { BalanceRef } from "../../store/api/material-balance-api";
import type { CustomNode } from "../../types";
import { balanceEnds } from "../../utils/materialBalance";
import { graphFixes, linkedElsewhere, type NodeFix } from "../../utils/stepCheck";
import { StepCheckNotice, type StepCheckState } from "../step-check/StepCheckNotice";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

interface Props {
  /** Преобразование расчёта. */
  nodeId: string;
  /** Примечания отказа — что, по мнению модели баланса, не так. */
  notes: string;
  /** Обозначения ответа модели (P1, P2, T1) — расшифровать их в замечании. */
  refs: BalanceRef[];
  nameOf: (ref: string) => string;
  /** «Новый расчёт» после исправления. */
  onNewRequest?: () => void;
}

export const BalanceStepFix: FC<Props> = ({ nodeId, notes, refs, nameOf, onNewRequest }) => {
  const dispatch = useAppDispatch();
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const [state, setState] = useState<StepCheckState | null>(null);
  const [applied, setApplied] = useState<NodeFix[] | null>(null);
  // Название преобразования на момент проверки: после исправления на узле
  // уже новое, а строка «было → стало» нужна прежняя.
  const [before, setBefore] = useState("");

  const t = nodes.find((n) => n.id === nodeId);
  const ends = useMemo(() => balanceEnds(nodeId, nodes, edges), [nodeId, nodes, edges]);
  const products = [...ends.ins, ...ends.outs];

  const run = async () => {
    if (!t || !ends.ins.length || !ends.outs.length) return;
    const product = (n: CustomNode) => ({
      name: label(n),
      ...(n.data?.description ? { description: String(n.data.description) } : {}),
    });
    // Модель баланса пишет «P1», «P2»: без расшифровки проверке не понять, о
    // каком продукте речь.
    const legend = refs.map((r) => `${r.ref} — «${nameOf(r.ref)}»`).join("; ");
    setApplied(null);
    setBefore(label(t));
    setState({ status: "loading" });
    try {
      const result = await checkStep({
        transformation: { name: label(t), ...(t.data?.description ? { description: String(t.data.description) } : {}) },
        inputs: ends.ins.map(product),
        outputs: ends.outs.map(product),
        fixed: products.filter((n) => linkedElsewhere(n.id, nodeId, nodes, edges)).map(label),
        remark: `Расчёт материального баланса отказался считать это преобразование. Его примечания${legend ? ` (обозначения: ${legend})` : ""}:\n${notes}`,
      });
      setState({ status: "done", result });
    } catch (e) {
      setState({
        status: "failed",
        error:
          e instanceof StepCheckUnsupported
            ? "сервер ещё не умеет проверять шаг — нужна его новая версия"
            : e instanceof Error
              ? e.message
              : String(e),
      });
    }
  };

  const apply = (result: StepCheckResult) => {
    const fixes = graphFixes(
      result,
      products.map((n) => ({ id: n.id, name: label(n) })),
      { id: nodeId, name: before || label(t) },
    );
    for (const f of fixes) {
      dispatch(
        updateNodeData({
          nodeId: f.nodeId,
          data: { label: f.label, ...(f.description ? { description: f.description } : {}) },
        }),
      );
    }
    setApplied(fixes);
  };

  if (!t) return null;
  if (!state) {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={run}
          title="Модель проверит шаг по замечанию расчёта и предложит, какие узлы переименовать; применить — по кнопке"
        >
          Исправить шаг
        </button>
      </div>
    );
  }

  const recalc = onNewRequest ? (
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={onNewRequest}>
        Новый расчёт
      </button>
    </div>
  ) : null;

  return (
    <StepCheckNotice
      state={state}
      transformationName={before || label(t)}
      applied={!!applied}
      onApply={state.status === "done" ? () => apply(state.result) : undefined}
      applyLabel="Применить к графу"
      onRetry={run}
      appliedHint={
        <>
          <div>Узлы на графе переименованы — посчитайте баланс заново.</div>
          {recalc}
        </>
      }
      wrongHint={
        <div>
          Переименованием это не исправить: поправьте шаг на графе вручную или
          перестройте его.
        </div>
      }
      okHint={
        <>
          <div>
            С замечанием расчёта проверка не согласна. Можно посчитать заново —
            другой моделью или со своими данными.
          </div>
          {recalc}
        </>
      }
    />
  );
};
