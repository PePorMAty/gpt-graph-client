import type { FC, ReactNode } from "react";

import {
  balanceInputNote,
  flowKind,
  flowRef,
  FLOW_KIND_TEXT,
  formatMass,
  formatView,
  scaleByFactor,
  type BalanceFlowResult,
  type BalanceInputAmount,
  type BalanceResult,
  type FlowKind,
} from "../../utils/materialBalance";
import type { BalanceRecord } from "../../store/api/material-balance-api";
import { ArrowRightIcon, HelpIcon, TableIcon } from "../icons";
import { BasisFields } from "./BasisFields";
import styles from "./MaterialBalance.module.css";

/** Роль строки — точкой цвета и словом. */
type Role = "input" | "target" | "off" | FlowKind;

const ROLE_TEXT: Record<Role, string> = {
  input: "сырьё",
  target: "продукт",
  off: "не в расчёте",
  ...FLOW_KIND_TEXT,
};

const RoleMark: FC<{ role: Role }> = ({ role }) => (
  <span className={styles.role}>
    <span className={`${styles.roleDot} ${styles[`role_${role}`]}`} aria-hidden />
    {ROLE_TEXT[role]}
  </span>
);

const Go: FC<{ nodeId: string | undefined; name: string; onGo?: (id: string) => void }> = ({
  nodeId,
  name,
  onGo,
}) =>
  nodeId && onGo ? (
    <button
      type="button"
      className={styles.goBtn}
      onClick={() => onGo(nodeId)}
      title="Показать узел на полотне"
      aria-label={`Перейти к «${name}» на полотне`}
    >
      <ArrowRightIcon size={14} />
    </button>
  ) : (
    <span className={styles.goNone} title="Этого потока нет на графе">
      —
    </span>
  );

/** Заголовок блока карточки: значок, название, подсказка по наведению. */
export const CardTitle: FC<{ icon: ReactNode; title: string; help?: string; as?: "h4" | "span" }> = ({
  icon,
  title,
  help,
  as: Tag = "h4",
}) => (
  <Tag className={styles.cardTitle}>
    <span className={styles.cardIcon}>{icon}</span>
    {title}
    {help && (
      <span className={styles.cardHelp} title={help} aria-label={help} role="img">
        <HelpIcon size={14} />
      </span>
    )}
  </Tag>
);

interface Props {
  result: BalanceResult;
  /** Запись расчёта — читаемая (readableRecord). */
  record: BalanceRecord;
  /** Подпись узла по id; нет узла — пусто. */
  labelOf: (id: string | undefined) => string;
  /** Количество сырья по обозначению; нет — таблица только для чтения. */
  onAmount?: (ref: string, value: BalanceInputAmount) => void;
  /** Подробный расчёт продукта. */
  onProduct?: (nodeId: string) => void;
  /** Показать узел на полотне. */
  onGo?: (nodeId: string) => void;
  /** Узел графа с таким названием — для потоков сверх сырья и продуктов. */
  findNode?: (name: string) => string | undefined;
}

/**
 * Таблица материального баланса: сырьё (количество правится прямо здесь —
 * массы пересчитываются без модели), продукты расчёта, невыбранные выходы и
 * потоки сверх графа — реагенты, побочные продукты, отходы, потери. Массы — на
 * количество человека. «Перейти» — к узлу на полотне.
 */
export const BalanceTable: FC<Props> = ({ result, record, labelOf, onAmount, onProduct, onGo, findNode }) => {
  const name = (f: BalanceFlowResult) => labelOf(f.nodeId) || f.name;
  const gone = (f: BalanceFlowResult) => !labelOf(f.nodeId);
  const extra = record.flows.filter((f) => !flowRef(record, f.name));

  return (
    <section className={styles.cardBlock}>
      <CardTitle
        icon={<TableIcon size={16} />}
        title="Таблица материального баланса"
        help="Массы — на ваше количество сырья. Количество любого сырья меняется прямо в таблице — массы пересчитаются без модели. Щелчок по продукту — его подробный расчёт, стрелка — узел на полотне."
      />
      <div className={styles.tableCard}>
        <table className={styles.balanceTable}>
          <thead>
            <tr>
              <th>Поток</th>
              <th>Роль</th>
              <th>Значение</th>
              <th className={styles.goCol}>Перейти</th>
            </tr>
          </thead>
          <tbody>
            {result.inputs.map((f) => (
              <tr key={f.ref}>
                <td>
                  <span className={styles.flowTitle}>{name(f)}</span>
                  {f.role === "basis" && result.inputs.length > 1 && (
                    <span className={styles.basisTag} title="Модель считала от количества этого сырья">
                      опорное
                    </span>
                  )}
                  {gone(f) && <span className={styles.flowGone}> · нет на графе</span>}
                  <span className={`${styles.rowNote} ${f.noRecipe ? styles.flowWarn : ""}`}>
                    {balanceInputNote(f, result)}
                  </span>
                </td>
                <td>
                  <RoleMark role="input" />
                </td>
                <td>
                  {onAmount ? (
                    <BasisFields
                      compact
                      value={f.set ?? { amount: null, unit: f.unit }}
                      onChange={(v) => onAmount(f.ref, v)}
                      label={name(f)}
                    />
                  ) : (
                    <b>{f.set ? formatView(f.set) : formatMass(f.mass, f.unit)}</b>
                  )}
                </td>
                <td className={styles.goCol}>
                  <Go nodeId={gone(f) ? undefined : f.nodeId} name={name(f)} onGo={onGo} />
                </td>
              </tr>
            ))}
            {result.targets.map((f) => (
              <tr key={f.ref}>
                <td>
                  {onProduct && f.nodeId && !gone(f) ? (
                    <button
                      type="button"
                      className={styles.flowLinkBtn}
                      onClick={() => onProduct(f.nodeId!)}
                      title="Подробный расчёт этого продукта"
                    >
                      {name(f)}
                    </button>
                  ) : (
                    <span className={styles.flowTitle}>{name(f)}</span>
                  )}
                  {gone(f) && <span className={styles.flowGone}> · нет на графе</span>}
                </td>
                <td>
                  <RoleMark role="target" />
                </td>
                <td>{f.mass ? <b>{formatMass(f.mass, f.unit)}</b> : <span className={styles.muted}>нет данных</span>}</td>
                <td className={styles.goCol}>
                  <Go nodeId={gone(f) ? undefined : f.nodeId} name={name(f)} onGo={onGo} />
                </td>
              </tr>
            ))}
            {result.outputs.map((f) => (
              <tr key={f.ref} className={styles.rowOff}>
                <td>
                  <span className={styles.flowTitle}>{name(f)}</span>
                </td>
                <td>
                  <RoleMark role="off" />
                </td>
                <td>{f.mass ? formatMass(f.mass, f.unit) : "—"}</td>
                <td className={styles.goCol}>
                  <Go nodeId={gone(f) ? undefined : f.nodeId} name={name(f)} onGo={onGo} />
                </td>
              </tr>
            ))}
            {extra.map((f) => {
              const kind = flowKind(f);
              const mass = scaleByFactor(f.massKg, result.factor);
              return (
                <tr key={`flow-${f.name}`}>
                  <td>
                    <span className={styles.flowTitle} title={f.basis ? `Основание: ${f.basis}` : undefined}>
                      {f.name}
                    </span>
                  </td>
                  <td>
                    <RoleMark role={kind} />
                  </td>
                  <td>{mass ? <b>{formatMass(mass, result.unit)}</b> : <span className={styles.muted}>нет данных</span>}</td>
                  <td className={styles.goCol}>
                    <Go nodeId={findNode?.(f.name)} name={f.name} onGo={onGo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
