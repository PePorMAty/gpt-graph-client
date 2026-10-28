import type { FC, ReactNode } from "react";

import { formatShare, type CalcFlow, type PercentRow } from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { ChevronRightIcon } from "../icons";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) =>
  String(n?.data?.label ?? "").trim();

/** Сырьё сверху, преобразование, продукты снизу — как на полотне. */
const Frame: FC<{
  transformation: CustomNode;
  inputs: ReactNode;
  outputs: ReactNode;
  footer?: ReactNode;
}> = ({ transformation, inputs, outputs, footer }) => (
  <div className={styles.scheme}>
    <div className={`${styles.schemeBlock} ${styles.schemeBasis}`}>
      <span className={styles.schemeRole}>Сырьё</span>
      {inputs}
    </div>
    <div className={styles.schemeArrow}>
      <span className={styles.schemeArrowIcon} aria-hidden>
        ↓
      </span>
      «{label(transformation)}»
    </div>
    <div className={styles.schemeBlock}>
      <span className={styles.schemeRole}>Продукты</span>
      {outputs}
    </div>
    {footer}
  </div>
);

interface FormProps {
  transformation: CustomNode;
  ins: CustomNode[];
  outs: CustomNode[];
  /** Опорное сырьё: модель считает на 1 т его. */
  basisId: string | null;
  onBasis: (inputId: string) => void;
  /** Выбранные продукты; null — все. */
  targets: string[] | null;
  onTargets: (ids: string[] | null) => void;
  disabled?: boolean;
  /** Побочные продукты, поставленные из таблицы, — подпись у их галочки. */
  byproductIds?: string[];
}

/**
 * Схема нового расчёта: опорное сырьё и продукты, для которых считать.
 * Количеств нет — расчёт в массовых процентах, модель считает на 1 т
 * опорного сырья.
 */
export const FormScheme: FC<FormProps> = ({
  transformation,
  ins,
  outs,
  basisId,
  onBasis,
  targets,
  onTargets,
  disabled,
  byproductIds = [],
}) => {
  const basis = ins.find((n) => n.id === basisId) ?? ins[0];
  const chosen = outs.filter((n) => !targets || targets.includes(n.id));
  const toggle = (id: string, on: boolean) => {
    const next = on
      ? [...chosen.map((n) => n.id), id]
      : chosen.map((n) => n.id).filter((x) => x !== id);
    onTargets(
      next.length === outs.length
        ? null
        : outs.map((n) => n.id).filter((x) => next.includes(x)),
    );
  };
  return (
    <Frame
      transformation={transformation}
      inputs={ins.map((n) => (
        <div key={n.id} className={styles.flowRow}>
          <span className={styles.flowName}>{label(n)}</span>
          {ins.length > 1 && (
            <label
              className={styles.basisPick}
              title="Модель считает на 1 т опорного сырья"
            >
              <input
                type="radio"
                name={`mb-basis-${transformation.id}`}
                checked={n === basis}
                disabled={disabled}
                onChange={() => onBasis(n.id)}
              />
              опорное
            </label>
          )}
          <span className={styles.flowNote}>
            {n === basis
              ? "основное сырьё — от него считает модель"
              : "сколько нужно — посчитает модель"}
          </span>
        </div>
      ))}
      outputs={outs.map((n) => {
        const on = chosen.includes(n);
        return (
          <label key={n.id} className={`${styles.flowRow} ${styles.flowCheck}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled || (on && chosen.length === 1)}
              onChange={(e) => toggle(n.id, e.target.checked)}
            />
            <span className={styles.flowName}>{label(n)}</span>
            <span className={styles.flowNote}>
              {byproductIds.includes(n.id)
                ? on
                  ? "побочный продукт — посчитается продуктом"
                  : "побочный продукт — модель даст его отдельно"
                : on
                  ? "сколько получится — посчитает модель"
                  : "не считать"}
            </span>
          </label>
        );
      })}
      footer={
        <>
          {ins.length > 1 && (
            <p className={styles.note}>
              Опорным выбирайте основное сырьё процесса, а не растворитель,
              экстрагент, катализатор или вспомогательный реагент: от их
              количества модель не найдёт выход продуктов.
            </p>
          )}
          {chosen.length > 0 && (
            <p className={styles.question}>
              {`Какую долю ${chosen.map((n) => `«${label(n)}»`).join(", ")} даёт сырьё ${ins.map((n) => `«${label(n)}»`).join(", ")}? В массовых процентах: сырьё — 100 %, продукт — 100 %, побочные продукты и отходы — отдельно.`}
            </p>
          )}
        </>
      }
    />
  );
};

interface CalcProps {
  transformation: CustomNode;
  /** Сырьё, продукты и невыбранные выходы расчёта (calcFlows). */
  flows: { inputs: CalcFlow[]; targets: CalcFlow[]; outputs: CalcFlow[] };
  /** Строки баланса в процентах по ключу (percentRows). */
  rows: Map<string, PercentRow>;
  /** Подпись узла по id; нет узла — пусто. */
  labelOf: (id: string | undefined) => string;
  /** Провалиться в расчёт продукта. */
  onProduct?: (nodeId: string) => void;
  /** Только этот продукт (обозначение) — схема расчёта одного продукта. */
  only?: string;
}

/**
 * Схема готового расчёта в массовых процентах — как в таблице, с правками;
 * продукт ведёт в свой расчёт.
 */
export const CalcScheme: FC<CalcProps> = ({
  transformation,
  flows,
  rows,
  labelOf,
  onProduct,
  only,
}) => {
  const name = (f: CalcFlow) => labelOf(f.nodeId) || f.name;
  const row = (f: CalcFlow) => rows.get(f.ref);
  const share = (f: CalcFlow) => {
    const r = row(f);
    return r ? formatShare(r) : "нет данных";
  };
  const gone = (f: CalcFlow) => !labelOf(f.nodeId);
  const targets = only
    ? flows.targets.filter((f) => f.ref === only)
    : flows.targets;
  return (
    <Frame
      transformation={transformation}
      inputs={flows.inputs.map((f) => (
        <div key={f.ref} className={styles.flowRow}>
          <span className={styles.flowName}>
            {name(f)}
            {f.role === "basis" && flows.inputs.length > 1 && (
              <span
                className={styles.basisTag}
                title="Модель считала на 1 т этого сырья"
              >
                опорное
              </span>
            )}
            {gone(f) && (
              <span className={styles.flowGone}> · нет на графе</span>
            )}
          </span>
          <span className={styles.flowMass}>{share(f)}</span>
          <span className={styles.flowNote}>
            {row(f)?.kind === "reagent" ? "% от массы продукта" : "% от массы сырья"}
            {row(f)?.edited ? " · правка" : ""}
          </span>
        </div>
      ))}
      outputs={
        <>
          {targets.map((f) => {
            const body = (
              <>
                <span className={styles.flowName}>
                  {name(f)}
                  {gone(f) && (
                    <span className={styles.flowGone}> · нет на графе</span>
                  )}
                </span>
                <span className={styles.flowMass}>
                  <b>{share(f)}</b>
                </span>
                {onProduct && f.nodeId && !gone(f) && (
                  <ChevronRightIcon size={14} />
                )}
              </>
            );
            return onProduct && f.nodeId && !gone(f) ? (
              <button
                key={f.ref}
                type="button"
                className={`${styles.flowRow} ${styles.flowLink}`}
                onClick={() => onProduct(f.nodeId!)}
                title="Подробный расчёт этого продукта"
              >
                {body}
              </button>
            ) : (
              <div key={f.ref} className={styles.flowRow}>
                {body}
              </div>
            );
          })}
          {!only &&
            flows.outputs.map((f) => (
              <div
                key={f.ref}
                className={`${styles.flowRow} ${styles.flowOff}`}
              >
                <span className={styles.flowName}>{name(f)}</span>
                <span className={styles.flowNote}>не в этом расчёте</span>
              </div>
            ))}
        </>
      }
    />
  );
};
