import type { FC, ReactNode } from "react";

import {
  balanceInputNote,
  formatMass,
  formatPercent,
  formatView,
  type BalanceFlowResult,
  type BalanceInputAmount,
  type BalanceResult,
} from "../../utils/materialBalance";
import type { BalanceAmount } from "../../store/api/material-balance-api";
import type { CustomNode } from "../../types";
import { ChevronRightIcon } from "../icons";
import { BasisFields } from "./BasisFields";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode | undefined) =>
  String(n?.data?.label ?? "").trim();

const EMPTY: BalanceInputAmount = { amount: null, unit: "т" };

const isSet = (a: BalanceInputAmount | undefined) =>
  !!a && a.amount !== null && a.amount > 0;

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
  /** Количество по id узла сырья. */
  amounts: Record<string, BalanceInputAmount>;
  onAmount: (inputId: string, value: BalanceInputAmount) => void;
  /** Опорное сырьё: от его количества считает модель. */
  basisId: string | null;
  onBasis: (inputId: string) => void;
  /** Выбранные продукты; null — все. */
  targets: string[] | null;
  onTargets: (ids: string[] | null) => void;
  disabled?: boolean;
  /**
   * В процентах: полей количества нет — доли от него не зависят, модель
   * считает на 1 т опорного (выбранного или основного).
   */
  percent?: boolean;
}

/**
 * Схема нового расчёта: количество каждого сырья (пусто — сколько нужно),
 * опорное сырьё и продукты, для которых считать. Модель считает от
 * количества опорного; остальное пересчитывается без неё. В процентах —
 * только опорное и продукты.
 */
export const FormScheme: FC<FormProps> = ({
  transformation,
  ins,
  outs,
  amounts,
  onAmount,
  basisId,
  onBasis,
  targets,
  onTargets,
  disabled,
  percent = false,
}) => {
  const picked = ins.find((n) => n.id === basisId);
  const basis = percent
    ? (picked ?? ins.find((n) => isSet(amounts[n.id])) ?? ins[0])
    : picked
      ? isSet(amounts[picked.id])
        ? picked
        : undefined
      : ins.find((n) => isSet(amounts[n.id]));
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
  const others = ins.filter((n) => n !== basis);
  return (
    <Frame
      transformation={transformation}
      inputs={ins.map((n) => {
        const value = amounts[n.id] ?? EMPTY;
        return (
          <div key={n.id} className={styles.flowRow}>
            <span className={styles.flowName}>{label(n)}</span>
            {!percent && (
              <BasisFields
                value={value}
                onChange={(v) => onAmount(n.id, v)}
                label={label(n)}
                disabled={disabled}
              />
            )}
            {ins.length > 1 && (
              <label
                className={styles.basisPick}
                title="От количества опорного сырья считает модель"
              >
                <input
                  type="radio"
                  name={`mb-basis-${transformation.id}`}
                  checked={n.id === (picked ?? basis)?.id}
                  disabled={disabled}
                  onChange={() => onBasis(n.id)}
                />
                опорное
              </label>
            )}
            <span className={styles.flowNote}>
              {percent
                ? n === basis
                  ? "основное сырьё — от него считает модель"
                  : "сколько нужно — посчитает модель"
                : n === basis
                ? "от этого количества считает модель"
                : n === picked
                  ? "опорное, но количество не задано — задайте его"
                  : isSet(value)
                    ? "задано — сравним с расходом по расчёту"
                    : "сколько нужно — посчитает модель"}
            </span>
          </div>
        );
      })}
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
              {on ? "сколько получится — посчитает модель" : "не считать"}
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
          <p className={styles.question}>
            {percent && chosen.length
              ? `Какую долю ${chosen.map((n) => `«${label(n)}»`).join(", ")} даёт сырьё ${ins.map((n) => `«${label(n)}»`).join(", ")}? Баланс — в процентах массы: приход и расход по 100 %.`
              : basis && chosen.length
              ? `Сколько ${chosen.map((n) => `«${label(n)}»`).join(", ")} получится из ${formatView(amounts[basis.id])} «${label(basis)}»${others.length ? ` и ${others.map((n) => `«${label(n)}»`).join(", ")}` : ""}?`
              : picked
                ? `Задайте количество опорного сырья «${label(picked)}» — от него посчитаем остальное.`
                : "Задайте количество хотя бы одного сырья — от него посчитаем остальное."}
          </p>
        </>
      }
    />
  );
};

interface CalcProps {
  transformation: CustomNode;
  result: BalanceResult;
  /** Подпись узла по id; нет узла — пусто. */
  labelOf: (id: string | undefined) => string;
  /** Количество сырья по обозначению. */
  onAmount: (ref: string, value: BalanceInputAmount) => void;
  /** Провалиться в расчёт продукта. */
  onProduct?: (nodeId: string) => void;
  /** Только этот продукт (обозначение) — схема расчёта одного продукта. */
  only?: string;
  readOnly?: boolean;
  /**
   * Доли от прихода по обозначениям (percentShares) — схема в процентах:
   * количества не правятся, у сырья и продуктов — их доли.
   */
  shares?: Map<string, BalanceAmount>;
}

/**
 * Схема готового расчёта: количество каждого сырья правится сразу — массы
 * продуктов пересчитываются без модели; продукт ведёт в свой расчёт.
 */
export const CalcScheme: FC<CalcProps> = ({
  transformation,
  result,
  labelOf,
  onAmount,
  onProduct,
  only,
  readOnly,
  shares,
}) => {
  const name = (f: BalanceFlowResult) => labelOf(f.nodeId) || f.name;
  const share = (f: BalanceFlowResult) => {
    const v = shares?.get(f.ref);
    return v ? formatPercent(v) : "нет данных";
  };
  const gone = (f: BalanceFlowResult) => !labelOf(f.nodeId);
  const targets = only
    ? result.targets.filter((f) => f.ref === only)
    : result.targets;
  return (
    <Frame
      transformation={transformation}
      inputs={result.inputs.map((f) => (
        <div key={f.ref} className={styles.flowRow}>
          <span className={styles.flowName}>
            {name(f)}
            {f.role === "basis" && result.inputs.length > 1 && (
              <span
                className={styles.basisTag}
                title="Модель считала от количества этого сырья"
              >
                опорное
              </span>
            )}
            {gone(f) && (
              <span className={styles.flowGone}> · нет на графе</span>
            )}
          </span>
          {shares ? (
            <span className={styles.flowMass}>{share(f)}</span>
          ) : readOnly ? (
            <span className={styles.flowMass}>
              {f.set ? formatView(f.set) : formatMass(f.mass, f.unit)}
            </span>
          ) : (
            <BasisFields
              value={f.set ?? { amount: null, unit: f.unit }}
              onChange={(v) => onAmount(f.ref, v)}
              label={name(f)}
            />
          )}
          <span
            className={`${styles.flowNote} ${!shares && f.noRecipe ? styles.flowWarn : ""}`}
          >
            {shares ? "доля прихода" : balanceInputNote(f, result)}
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
                  {shares ? (
                    <b>{share(f)}</b>
                  ) : f.mass ? (
                    <b>{formatMass(f.mass, f.unit)}</b>
                  ) : (
                    "нет данных"
                  )}
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
            result.outputs.map((f) => (
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
