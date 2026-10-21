import type { FC, ReactNode } from "react";

import {
  balanceInputNote,
  flowKind,
  flowRef,
  FLOW_KIND_TEXT,
  formatMass,
  formatPercent,
  formatView,
  percentBalance,
  placeableFlow,
  scaleByFactor,
  type BalanceDisplay,
  type BalanceEdgeRole,
  type BalanceFlowResult,
  type BalanceInputAmount,
  type BalanceResult,
  type FlowKind,
  type PercentRow,
} from "../../utils/materialBalance";
import type { BalanceFlow, BalanceRecord } from "../../store/api/material-balance-api";
import { ArrowRightIcon, HelpIcon, PlusIcon, TableIcon } from "../icons";
import { BasisFields } from "./BasisFields";
import { DisplaySwitch } from "./DisplaySwitch";
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

/**
 * Роль под названием — для узкой таблицы (вкладка карточки): там столбец
 * «Роль» прячется, и без этого названия рвались посреди слова.
 */
const RoleInline: FC<{ role: Role }> = ({ role }) => (
  <span className={styles.roleInline}>
    <RoleMark role={role} />
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

/**
 * Поток сверх графа: узел у преобразования — стрелка к нему; нет — «+»,
 * поставить на граф (выходом или сырьём). Несколько веществ одной строкой и
 * потери не ставятся — прочерк.
 */
const FlowGo: FC<{
  flow: Pick<BalanceFlow, "name" | "direction">;
  nodeId: string | undefined;
  onGo?: (id: string) => void;
  onPlace?: (flow: Pick<BalanceFlow, "name" | "direction">) => void;
}> = ({ flow, nodeId, onGo, onPlace }) => {
  if (nodeId || !onPlace || !placeableFlow(flow)) {
    return <Go nodeId={nodeId} name={flow.name} onGo={onGo} />;
  }
  const where = flowKind(flow) === "reagent" ? "сырьём" : "выходом";
  return (
    <button
      type="button"
      className={styles.goBtn}
      onClick={() => onPlace(flow)}
      title={`Поставить «${flow.name}» на граф ${where} этого преобразования`}
      aria-label={`Поставить «${flow.name}» на граф`}
    >
      <PlusIcon size={14} />
    </button>
  );
};

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
  /** Проценты (сырьё — 100 %, продукт — 100 %) или массы; по умолчанию — массы. */
  display?: BalanceDisplay;
  /** Поставить поток сверх графа на граф; нет — только смотреть. */
  onPlaceFlow?: (flow: Pick<BalanceFlow, "name" | "direction">) => void;
  /** Роль сырья или продукта расчёта по обозначению — с его связи на графе. */
  roleOf?: (ref: string) => BalanceEdgeRole | undefined;
}

const MASS_HELP =
  "Массы — на ваше количество сырья. Количество любого сырья меняется прямо в таблице — массы пересчитаются без модели. Щелчок по продукту — его подробный расчёт, стрелка — узел на полотне.";
const PERCENT_HELP =
  "Проценты по массам расчёта модели: сырьё вместе — 100 %, продукт — 100 % (несколько продуктов делят эти 100 %). Реагенты сверх графа, побочные продукты, отходы и потери в эти 100 % не входят — они ниже, отдельно, в процентах от массы продукта. От количества сырья проценты не зависят; массы на ваше количество — переключатель «т». Щелчок по продукту — его подробный расчёт, стрелка — узел на полотне, «+» — поставить вещество на граф.";

/**
 * Баланс в процентах: сырьё — 100 %, продукт — 100 %, прочее — отдельно, в
 * процентах от массы продукта. Строки сырья и продуктов расчёта ведут к
 * узлам по обозначению, потоки сверх графа — по названию.
 */
const PercentBody: FC<Omit<Props, "onAmount" | "display">> = ({
  result,
  record,
  labelOf,
  onProduct,
  onGo,
  findNode,
  onPlaceFlow,
  roleOf,
}) => {
  const pb = percentBalance(record, roleOf);
  const nodeByRef = new Map(
    [...result.inputs, ...result.targets, ...result.outputs].map((f) => [f.ref, f.nodeId]),
  );
  const nodeOf = (r: PercentRow) => {
    if (!r.ref) return findNode?.(r.name);
    const id = nodeByRef.get(r.ref);
    return labelOf(id) ? id : undefined;
  };
  const nameOf = (r: PercentRow) => (r.ref ? labelOf(nodeByRef.get(r.ref)) : "") || r.name;
  const role = (r: PercentRow): Role => (r.kind === "input" ? "input" : r.kind);

  if (pb.empty) {
    return (
      <p className={styles.muted}>
        Масс сырья в расчёте нет — долей не посчитать. Что нашла модель — в
        разделах ответа ниже.
      </p>
    );
  }

  const line = (r: PercentRow, i: number) => {
    const id = nodeOf(r);
    const name = nameOf(r);
    return (
      <tr key={`${r.ref ?? r.name}-${i}`} className={r.kind === "off" ? styles.rowOff : undefined}>
        <td>
          {r.kind === "target" && onProduct && id ? (
            <button
              type="button"
              className={styles.flowLinkBtn}
              onClick={() => onProduct(id)}
              title="Подробный расчёт этого продукта"
            >
              {name}
            </button>
          ) : (
            <span className={styles.flowTitle}>{name}</span>
          )}
          <RoleInline role={role(r)} />
        </td>
        <td className={styles.roleCol}>
          <RoleMark role={role(r)} />
        </td>
        <td className={styles.numCol}>
          {r.share ? <b>{formatPercent(r.share)}</b> : <span className={styles.muted}>нет данных</span>}
        </td>
        <td className={styles.goCol}>
          {r.ref ? (
            <Go nodeId={id} name={name} onGo={onGo} />
          ) : (
            <FlowGo
              flow={{ name: r.name, direction: r.kind === "reagent" ? "in" : "out" }}
              nodeId={id}
              onGo={onGo}
              onPlace={onPlaceFlow}
            />
          )}
        </td>
      </tr>
    );
  };

  const total = (title: string) => (
    <tr className={styles.totalRow}>
      <td>{title}</td>
      <td className={styles.roleCol} />
      <td className={styles.numCol}>100 %</td>
      <td />
    </tr>
  );
  const many = pb.products.length > 1;

  return (
    <>
      <div className={styles.tableCard}>
        <table className={styles.balanceTable}>
          <thead>
            <tr>
              <th>Поток</th>
              <th className={styles.roleCol}>Роль</th>
              <th className={styles.numCol}>%</th>
              <th className={styles.goCol}>
                <span className={styles.goHead}>Перейти</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={styles.sideRow}>
              <td colSpan={4}>Сырьё</td>
            </tr>
            {pb.raw.map(line)}
            {pb.raw.length > 1 && total("Итого сырьё")}
            <tr className={styles.sideRow}>
              <td colSpan={4}>{many ? "Продукты" : "Продукт"}</td>
            </tr>
            {pb.products.map(line)}
            {many && total("Итого продукты")}
            {pb.separate.length > 0 && (
              <>
                <tr className={styles.sideRow}>
                  <td colSpan={4}>Отдельно — % от массы {many ? "продуктов" : "продукта"}</td>
                </tr>
                {pb.separate.map(line)}
              </>
            )}
          </tbody>
        </table>
      </div>
      {pb.partialRaw && (
        <p className={styles.note}>
          У части сырья массы в расчёте нет — доли посчитаны от сырья с массой.
        </p>
      )}
      {pb.partialProducts && (
        <p className={styles.note}>
          У части продуктов массы в расчёте нет — доли посчитаны от продуктов с массой.
        </p>
      )}
      {pb.separate.length === 0 && (
        <p className={styles.note}>
          Побочных продуктов, отходов и реагентов сверх графа модель не назвала.
        </p>
      )}
    </>
  );
};

/**
 * Таблица материального баланса: сырьё (количество правится прямо здесь —
 * массы пересчитываются без модели), продукты расчёта, невыбранные выходы и
 * потоки сверх графа — реагенты, побочные продукты, отходы, потери. Массы — на
 * количество человека. «Перейти» — к узлу на полотне.
 */
export const BalanceTable: FC<Props> = ({
  result,
  record,
  labelOf,
  onAmount,
  onProduct,
  onGo,
  findNode,
  display = "mass",
  onPlaceFlow,
  roleOf,
}) => {
  const name = (f: BalanceFlowResult) => labelOf(f.nodeId) || f.name;
  const gone = (f: BalanceFlowResult) => !labelOf(f.nodeId);
  const extra = record.flows.filter((f) => !flowRef(record, f.name));
  const percent = display === "percent";

  return (
    <section className={styles.cardBlock}>
      <div className={styles.cardTitleRow}>
        <CardTitle
          icon={<TableIcon size={16} />}
          title="Таблица материального баланса"
          help={percent ? PERCENT_HELP : MASS_HELP}
        />
        <DisplaySwitch />
      </div>
      {percent ? (
        <PercentBody
          result={result}
          record={record}
          labelOf={labelOf}
          onProduct={onProduct}
          onGo={onGo}
          findNode={findNode}
          onPlaceFlow={onPlaceFlow}
          roleOf={roleOf}
        />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.balanceTable}>
            <thead>
              <tr>
                <th>Поток</th>
                <th className={styles.roleCol}>Роль</th>
                <th>Значение</th>
                <th className={styles.goCol}>
                  <span className={styles.goHead}>Перейти</span>
                </th>
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
                    <RoleInline role="input" />
                  </td>
                  <td className={styles.roleCol}>
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
                    <RoleInline role="target" />
                  </td>
                  <td className={styles.roleCol}>
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
                    <RoleInline role="off" />
                  </td>
                  <td className={styles.roleCol}>
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
                      <RoleInline role={kind} />
                    </td>
                    <td className={styles.roleCol}>
                      <RoleMark role={kind} />
                    </td>
                    <td>{mass ? <b>{formatMass(mass, result.unit)}</b> : <span className={styles.muted}>нет данных</span>}</td>
                    <td className={styles.goCol}>
                      <FlowGo flow={f} nodeId={findNode?.(f.name)} onGo={onGo} onPlace={onPlaceFlow} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
