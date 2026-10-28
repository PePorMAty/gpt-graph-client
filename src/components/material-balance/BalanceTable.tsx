import { useState, type FC, type ReactNode } from "react";

import {
  flowKind,
  FLOW_KIND_TEXT,
  formatPercent,
  formatShare,
  formatShareTotal,
  parseShareInput,
  percentBalance,
  placeableFlow,
  shareInputValue,
  shareTotal,
  type BalanceEdgeRole,
  type BalanceShares,
  type FlowKind,
  type PercentRow,
} from "../../utils/materialBalance";
import type { BalanceFlow, BalanceRecord } from "../../store/api/material-balance-api";
import { ArrowRightIcon, HelpIcon, PlusIcon, TableIcon } from "../icons";
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
  /** Запись расчёта — читаемая (readableRecord). */
  record: BalanceRecord;
  /** Узлы графа по обозначениям расчёта (MaterialBalanceCalc.nodeIds). */
  nodeIds: Record<string, string>;
  /** Подпись узла по id; нет узла — пусто. */
  labelOf: (id: string | undefined) => string;
  /** Проценты, поправленные вручную (MaterialBalanceCalc.shares). */
  shares?: BalanceShares;
  /** Сохранить правки процентов — все правки расчёта; нет — только смотреть. */
  onShares?: (shares: BalanceShares) => void;
  /** Подробный расчёт продукта. */
  onProduct?: (nodeId: string) => void;
  /** Показать узел на полотне. */
  onGo?: (nodeId: string) => void;
  /** Узел графа с таким названием — для потоков сверх сырья и продуктов. */
  findNode?: (name: string) => string | undefined;
  /** Поставить поток сверх графа на граф; нет — только смотреть. */
  onPlaceFlow?: (flow: Pick<BalanceFlow, "name" | "direction">) => void;
  /** Роль сырья или продукта расчёта по обозначению — с его связи на графе. */
  roleOf?: (ref: string) => BalanceEdgeRole | undefined;
}

const TABLE_HELP =
  "Массовые проценты по расчёту модели: сырьё вместе — 100 % (общая масса сырья), продукт — 100 % (масса продукта; несколько продуктов делят эти 100 %). Реагенты сверх графа, побочные продукты, отходы и потери в эти 100 % не входят — они ниже, отдельно, в процентах от массы продукта. Любой процент можно поправить вручную — щелчком по нему; другие проценты при этом не меняются. Щелчок по продукту — его подробный расчёт, стрелка — узел на полотне, «+» — поставить вещество на граф.";

const PERCENT_HELP =
  "Массовые проценты (% масс.): доля массы вещества — не объёма и не молей. Сырьё: 100 % — общая масса всего сырья. Продукт: 100 % — масса продукта (несколько продуктов делят эти 100 %). Отдельно — в процентах от массы продукта.";

/**
 * Процент строки. Можно править — щелчок открывает поле: Enter или уход из
 * поля — сохранить, Esc — отменить, пусто — вернуть долю модели. Правка
 * ставит число как есть и другие строки не трогает.
 */
const ShareCell: FC<{
  row: PercentRow;
  name: string;
  /** Новое значение (проценты); undefined — вернуть долю модели. Нет — только смотреть. */
  onSet?: (value: number | undefined) => void;
}> = ({ row, name, onSet }) => {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const value = row.share ? <b>{formatShare(row)}</b> : <span className={styles.muted}>нет данных</span>;
  if (!onSet) return value;
  const model = row.model ? formatPercent(row.model) : "нет данных";

  if (text !== null) {
    const close = () => {
      setText(null);
      setBad(false);
    };
    const save = (leaving: boolean) => {
      const v = parseShareInput(text);
      if (v === null) {
        // Ушли из поля с неверным числом — как было; Enter — подсветить.
        if (leaving) close();
        else setBad(true);
        return;
      }
      close();
      if (v !== undefined || row.edited) onSet(v);
    };
    return (
      <input
        className={`${styles.amount} ${styles.shareInput} ${bad ? styles.amountBad : ""}`}
        autoFocus
        inputMode="decimal"
        value={text}
        aria-label={`Массовые проценты «${name}»`}
        aria-invalid={bad}
        title={bad ? "Число от 0 до 10 000" : "Enter — сохранить, Esc — отменить, пусто — как у модели"}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save(false);
          if (e.key === "Escape") close();
        }}
        onBlur={() => save(true)}
      />
    );
  }

  return (
    <span className={styles.shareCell}>
      <button
        type="button"
        className={`${styles.shareBtn} ${row.edited ? styles.shareEdited : ""}`}
        onClick={() => setText(shareInputValue(row))}
        title={
          row.edited
            ? `Поправлено вручную; у модели — ${model}. Щелчок — поправить`
            : "Щелчок — поправить вручную"
        }
        aria-label={`Поправить проценты «${name}»`}
      >
        {value}
      </button>
      {row.edited && (
        <button
          type="button"
          className={styles.shareReset}
          onClick={() => onSet(undefined)}
          title={`Вернуть как у модели: ${model}`}
          aria-label={`Вернуть проценты «${name}» как у модели`}
        >
          ↺
        </button>
      )}
    </span>
  );
};

/**
 * Таблица материального баланса в массовых процентах: сырьё — 100 %,
 * продукт — 100 %, прочее — отдельно, в процентах от массы продукта. Строки
 * сырья и продуктов расчёта ведут к узлам по обозначению, потоки сверх
 * графа — по названию. Любой процент правится вручную, сам по себе: «Итого»
 * показывает сумму как есть.
 */
export const BalanceTable: FC<Props> = ({
  record,
  nodeIds,
  labelOf,
  shares,
  onShares,
  onProduct,
  onGo,
  findNode,
  onPlaceFlow,
  roleOf,
}) => {
  const pb = percentBalance(record, roleOf, shares);
  const nodeOf = (r: PercentRow) => {
    if (!r.ref) return findNode?.(r.name);
    const id = nodeIds[r.ref];
    return labelOf(id) ? id : undefined;
  };
  const nameOf = (r: PercentRow) => (r.ref ? labelOf(nodeIds[r.ref]) : "") || r.name;
  const edited = [...pb.raw, ...pb.products, ...pb.separate].filter((r) => r.edited).length;
  const setShare = onShares
    ? (key: string) => (value: number | undefined) => {
        const next = { ...shares };
        if (value === undefined) delete next[key];
        else next[key] = value;
        onShares(next);
      }
    : undefined;

  const line = (r: PercentRow) => {
    const id = nodeOf(r);
    const name = nameOf(r);
    return (
      <tr key={r.key} className={r.kind === "off" ? styles.rowOff : undefined}>
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
          <RoleInline role={r.kind} />
        </td>
        <td className={styles.roleCol}>
          <RoleMark role={r.kind} />
        </td>
        <td className={styles.numCol}>
          <ShareCell row={r} name={name} onSet={setShare?.(r.key)} />
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

  /** «Итого»: сумма как есть — после правок она может уйти от 100 %. */
  const total = (title: string, rows: PercentRow[]) => {
    if (rows.length < 2 && !rows.some((r) => r.edited)) return null;
    const t = shareTotal(rows);
    if (!t) return null;
    const off = Math.abs(t.percent - 100) >= 0.05;
    return (
      <tr className={styles.totalRow}>
        <td>{title}</td>
        <td className={styles.roleCol} />
        <td
          className={`${styles.numCol} ${off ? styles.totalOff : ""}`}
          title={off ? "Сумма не 100 %: проценты правятся каждый сам по себе — поправьте остальные" : undefined}
        >
          {formatShareTotal(t)}
        </td>
        <td />
      </tr>
    );
  };
  const many = pb.products.length > 1;
  const side = (title: string, what: string) => (
    <tr className={styles.sideRow}>
      <td colSpan={4}>
        {title} <span className={styles.sideNote}>— {what}</span>
      </td>
    </tr>
  );

  return (
    <section className={styles.cardBlock}>
      <CardTitle icon={<TableIcon size={16} />} title="Таблица материального баланса" help={TABLE_HELP} />
      <div className={styles.tableCard}>
        <table className={styles.balanceTable}>
          <thead>
            <tr>
              <th>Поток</th>
              <th className={styles.roleCol}>Роль</th>
              <th className={styles.numCol}>
                <span className={styles.numHead}>
                  % масс.
                  <span className={styles.cardHelp} title={PERCENT_HELP} aria-label={PERCENT_HELP} role="img">
                    <HelpIcon size={13} />
                  </span>
                </span>
              </th>
              <th className={styles.goCol}>
                <span className={styles.goHead}>Перейти</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {side("Сырьё", "100 % = общая масса сырья")}
            {pb.raw.map(line)}
            {total("Итого сырьё", pb.raw)}
            {many
              ? side("Продукты", "100 % = общая масса продуктов")
              : side("Продукт", "100 % = масса продукта")}
            {pb.products.map(line)}
            {total(many ? "Итого продукты" : "Итого продукт", pb.products)}
            {pb.separate.length > 0 && (
              <>
                {side("Отдельно", `в % от массы ${many ? "продуктов" : "продукта"}`)}
                {pb.separate.map(line)}
              </>
            )}
          </tbody>
        </table>
      </div>
      {pb.empty && (
        <p className={styles.note}>
          Масс в расчёте нет — модель долей не дала.
          {onShares
            ? " Проценты можно вписать вручную: щелчок по «нет данных»."
            : " Что нашла модель — в разделах ответа ниже."}
        </p>
      )}
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
      {edited > 0 && (
        <p className={styles.note}>
          Поправлено вручную: {edited} — такие проценты выделены. Правка не меняет
          другие проценты: «Итого» показывает сумму как есть.
          {onShares && (
            <>
              {" "}
              <button type="button" className={styles.linkBtn} onClick={() => onShares({})}>
                Вернуть все как у модели
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
};
