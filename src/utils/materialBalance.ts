// src/utils/materialBalance.ts
//
// Материальный баланс на клиенте: где лежат расчёты, как пересчитать их на
// количество сырья человека и что написать на узлах.
//
// Расчёт — преобразование целиком: всё его сырьё и выбранные продукты.
// Модель считает на количество одного сырья (опорного) и даёт массы
// остального сырья и каждого продукта — это рецепт. Массы пропорциональны,
// поэтому любое количество любого сырья пересчитывается без нового запроса:
// продукта получится столько, на сколько хватит сырья, которого меньше всего
// относительно рецепта (лимитирующего), а остальное сырьё — с остатком.
// Сырьё без заданного количества берётся «сколько нужно».
//
// Прежние расчёты — пара «сырьё → продукт» на 1 т сырья — тот же вид с одним
// продуктом: читаются тем же кодом.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type {
  BalanceAmount,
  BalanceCoefficient,
  BalanceRecord,
  BalanceRef,
  BalanceSource,
  BalanceStatus,
} from "../store/api/material-balance-api";
import { inferTFlow, productTransformationEnds, tFlowOf, type TFlow } from "./edgeFlow";
import { normalizeProductName } from "./normalizeProductName";

export type BalanceUnit = "кг" | "т" | "тыс. т";

export const BALANCE_UNITS: BalanceUnit[] = ["кг", "т", "тыс. т"];

export const UNIT_KG: Record<BalanceUnit, number> = {
  кг: 1,
  т: 1000,
  "тыс. т": 1_000_000,
};

/**
 * Количество: столько-то кг, т или тыс. т. Смена единицы меняет смысл
 * числа — «1 т» становится «1 кг», — а не переводит его.
 */
export interface BalanceView {
  amount: number;
  unit: BalanceUnit;
}

export const DEFAULT_VIEW: BalanceView = { amount: 1, unit: "т" };

/**
 * Количество одного сырья в расчёте: amount null — не задано, «сколько
 * нужно». Единица остаётся и у пустого: в ней показано, сколько нужно.
 */
export interface BalanceInputAmount {
  amount: number | null;
  unit: BalanceUnit;
}

/** Количества сырья расчёта по обозначениям (P1, P3…). */
export type BalanceAmounts = Record<string, BalanceInputAmount>;

/**
 * Расчёт в графе. Лежит в данных узла преобразования (materialBalances) и
 * сохраняется с графом — поэтому виден и по ссылке, и после перезагрузки.
 */
export interface MaterialBalanceCalc {
  /** Запись базы сервера: разбор ответа модели и сам ответ. */
  record: BalanceRecord;
  /** Узлы этого графа по обозначениям расчёта: P1 → id, …, T1 → id. */
  nodeIds: Record<string, string>;
  /** Взят из базы готовым, модель в этот раз не спрашивали. */
  fromCache?: boolean;
  /** Когда расчёт лёг в граф (ISO). */
  addedAt: string;
  /** Количество каждого сырья. Нет — расчёт прежней версии, см. view. */
  amounts?: BalanceAmounts;
  /** Прежние версии: количество сырья пары (P1). */
  view?: BalanceView;
}

export const STATUS_TEXT: Record<BalanceStatus, string> = {
  calculated: "Рассчитан",
  partial: "Частично рассчитан",
  insufficient: "Недостаточно данных",
  invalid_selection: "Некорректный выбор",
  invalid_basis: "Не задано количество сырья",
  unknown: "Статус не распознан",
};

export const STATUS_TONE: Record<BalanceStatus, "ok" | "warn" | "bad"> = {
  calculated: "ok",
  partial: "warn",
  insufficient: "bad",
  invalid_selection: "bad",
  invalid_basis: "bad",
  unknown: "bad",
};

const isP = (r: BalanceRef) => /^P\d+$/.test(r.ref);

/** Сырьё расчёта, опорное первым. */
export const inputRefs = (record: Pick<BalanceRecord, "refs">) =>
  record.refs.filter((r) => isP(r) && (r.role === "basis" || r.role === "input"));

/** Продукты, для которых посчитано. */
export const targetRefs = (record: Pick<BalanceRecord, "refs">) =>
  record.refs.filter((r) => isP(r) && r.role === "target");

/** Выходы преобразования, которые в расчёт не выбирали. */
export const otherOutputRefs = (record: Pick<BalanceRecord, "refs">) =>
  record.refs.filter((r) => isP(r) && r.role === "output");

/** Расчёт прежней версии: пара «сырьё → продукт» на 1 т сырья. */
export const isPairCalc = (record: Pick<BalanceRecord, "kind">) => record.kind !== "transformation";

/** Количества сырья расчёта; у прежнего — его количество у сырья пары (P1). */
export function amountsOf(calc: Pick<MaterialBalanceCalc, "amounts" | "view">): BalanceAmounts {
  if (calc.amounts) return calc.amounts;
  const view = calc.view ?? DEFAULT_VIEW;
  return { P1: { amount: view.amount, unit: view.unit } };
}

/** Ключ набора продуктов (id узлов): порядок не важен. */
export const targetsKey = (ids: string[]) => `→${[...ids].sort().join("|")}`;

/**
 * Ключ расчёта в узле: какие продукты посчитаны. Новый расчёт тех же
 * продуктов заменяет прежний; у прежних расчётов пары — сама пара.
 */
export function calcKey(c: Pick<MaterialBalanceCalc, "nodeIds" | "record">): string {
  if (!c.record || isPairCalc(c.record)) return `${c.nodeIds?.P1 ?? ""}|${c.nodeIds?.P2 ?? ""}`;
  return targetsKey(targetRefs(c.record).map((r) => c.nodeIds?.[r.ref] ?? `?${r.name}`));
}

/**
 * Расчёты узла преобразования, свежие первыми, — по одному на набор
 * продуктов. Новый расчёт тех же продуктов заменяет прежний.
 *
 * Прежние версии копили расчёты одной пары без счёта — лишние, старые, не
 * показываем. Не показываем и расчёты «вверх» (на 1 т продукта) недолгой
 * версии с направлениями: их числа посчитаны на другой базис. Первая же
 * запись в узел их отбрасывает.
 */
export function calcsOf(node: CustomNode | undefined | null): MaterialBalanceCalc[] {
  const list = node?.data?.materialBalances;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: MaterialBalanceCalc[] = [];
  for (const c of list as MaterialBalanceCalc[]) {
    if (!c?.record || typeof c.record.id !== "number") continue;
    if ((c.record as { direction?: string }).direction === "up") continue;
    const key = calcKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Все расчёты графа, свежие первыми. */
export function allCalcs(
  nodes: CustomNode[],
): Array<{ nodeId: string; calc: MaterialBalanceCalc }> {
  return nodes
    .filter((n) => n.type === "transformation")
    .flatMap((n) => calcsOf(n).map((calc) => ({ nodeId: n.id, calc })))
    .sort((a, b) => b.calc.addedAt.localeCompare(a.calc.addedAt));
}

const sameName = (a: unknown, b: unknown) =>
  normalizeProductName(String(a ?? "")) === normalizeProductName(String(b ?? ""));

/** Название без пояснений в скобках: «Нафта (нефтяная фракция…)» → «нафта». */
const coreName = (s: unknown) =>
  normalizeProductName(String(s ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim());

/** Продукт в одном ряду с преобразованием: зазор гасит дрожание узлов ряда. */
const SAME_ROW = 10;

/**
 * Сырьё и продукты преобразования — как они нарисованы, основные первыми.
 *
 * Связь с пометкой смысла (tFlow) рисуется по смыслу: сырьё входит в верх
 * преобразования, продукт выходит из низа, а стоящий не на своей стороне —
 * в обход. Связь старых графов без пометки рисуется по положению: продукт
 * выше преобразования — у его верха, ниже — у низа. Так и считаем: баланс
 * видит то же, что человек на полотне. Только для продукта в одном ряду с
 * преобразованием смысл по-прежнему выводится (inferTFlow).
 *
 * Основной — тот, у кого больше связей: продукт цепочки связан и с
 * соседними шагами, а реагент вроде метанола у «Получения МТБЭ» обычно
 * висит на одной связи.
 */
export function balanceEnds(
  transformationId: string,
  nodes: CustomNode[],
  edges: Edge[],
): { ins: CustomNode[]; outs: CustomNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeOf = (id: string) => byId.get(id)?.type;
  const t = byId.get(transformationId);
  const ins = new Set<string>();
  const outs = new Set<string>();
  let inferred: Map<string, TFlow | undefined> | null = null;
  for (const e of edges) {
    const ends = productTransformationEnds(e, typeOf);
    if (!ends || ends.transformation !== transformationId) continue;
    let flow = tFlowOf(e);
    if (!flow) {
      const dy = (byId.get(ends.product)?.position?.y ?? 0) - (t?.position?.y ?? 0);
      if (dy < -SAME_ROW) flow = "in";
      else if (dy > SAME_ROW) flow = "out";
      else {
        inferred ??= new Map(inferTFlow(nodes, edges).map((x) => [x.id, tFlowOf(x)]));
        flow = inferred.get(e.id) ?? (ends.product === e.source ? "in" : "out");
      }
    }
    (flow === "in" ? ins : outs).add(ends.product);
  }
  // Нарисован и входом, и выходом — вход (так же решает сервер).
  for (const id of ins) outs.delete(id);
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const order = (ids: Set<string>) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((n): n is CustomNode => !!n && n.type === "product")
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  return { ins: order(ins), outs: order(outs) };
}

/**
 * Вспомогательное вещество процесса: растворитель, экстрагент, катализатор,
 * вода, пар, воздух. От его количества модели не найти выходы продуктов.
 */
const AUXILIARY =
  /(^|\s)(вод[аы]|пар|воздух|кислород|катализатор\S*|растворител\S*|экстрагент\S*|абсорбент\S*|адсорбент\S*|ингибитор\S*|инициатор\S*)(\s|$)/i;

/**
 * Вещество названо в технологии агентом: «ректификация с ацетонитрилом»,
 * «алкилирование в присутствии хлорида алюминия», «экстракция
 * N-метилпирролидоном» здесь не ловим — только «с …» и «в присутствии …».
 */
function namedAsAgent(transformation: string, name: string): boolean {
  const word = normalizeProductName(name)
    .split(/[\s-]+/)
    .find((w) => w.length >= 4);
  if (!word) return false;
  // Основа слова — без окончания; скобки в названиях («серы(IV)») экранируем.
  const stem = word
    .slice(0, Math.max(4, word.length - 2))
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)(?:с|со|в присутствии)\\s+(?:\\S+\\s+)?${stem}`, "i").test(
    normalizeProductName(transformation),
  );
}

/**
 * Опорное сырьё по умолчанию: первое (основное), если оно не
 * вспомогательное; иначе первое невспомогательное. Опорным модели надо
 * основное сырьё процесса: от количества растворителя («ректификация с
 * ацетонитрилом») она выход продукта не найдёт.
 */
export function defaultBasisId(transformation: CustomNode | undefined, ins: CustomNode[]): string | null {
  const tLabel = String(transformation?.data?.label ?? "");
  const aux = (n: CustomNode) => {
    const label = String(n.data?.label ?? "");
    return AUXILIARY.test(normalizeProductName(label)) || namedAsAgent(tLabel, label);
  };
  return (ins.find((n) => !aux(n)) ?? ins[0])?.id ?? null;
}

const isInputRole = (r: BalanceRef) => r.role === "basis" || r.role === "input";

/**
 * Узлы графа по обозначениям расчёта. Сырьё ищется среди сырья
 * преобразования, продукты — среди продуктов:
 *
 * 1. hint — что сказал сервер (готовый расчёт из базы он сопоставил по
 *    справочнику) или что выбрал человек (P1 и P2 прежней пары);
 * 2. id узла, на котором считали (свежий расчёт этого графа);
 * 3. название;
 * 4. последний неразобранный на своей стороне — тот самый (переименовали).
 */
export function nodeIdsFor(
  record: Pick<BalanceRecord, "refs">,
  ends: { transformationId: string; ins: CustomNode[]; outs: CustomNode[] },
  hint?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { T1: ends.transformationId };
  const used = new Set<string>();
  const refs = record.refs.filter(isP);
  const listFor = (r: BalanceRef) => (isInputRole(r) ? ends.ins : ends.outs);
  const take = (r: BalanceRef, id: string | undefined) => {
    if (!id || used.has(id) || out[r.ref] || !listFor(r).some((n) => n.id === id)) return;
    out[r.ref] = id;
    used.add(id);
  };
  for (const r of refs) take(r, hint?.[r.ref]);
  for (const r of refs) take(r, r.id);
  for (const r of refs) {
    if (out[r.ref]) continue;
    const want = coreName(r.name);
    const node =
      listFor(r).find((n) => !used.has(n.id) && sameName(n.data?.label, r.name)) ??
      listFor(r).find((n) => !used.has(n.id) && want !== "" && coreName(n.data?.label) === want);
    take(r, node?.id);
  }
  for (const side of [true, false]) {
    const left = refs.filter((r) => isInputRole(r) === side && !out[r.ref] && r.role !== "output");
    const free = (side ? ends.ins : ends.outs).filter((n) => !used.has(n.id));
    if (left.length === 1 && free.length === 1) take(left[0], free[0].id);
  }
  return out;
}

/** Сырьё или продукт: роль обозначения в расчёте. */
export function refRole(record: Pick<BalanceRecord, "refs">, ref: string): "сырьё" | "продукт" {
  const role = record.refs.find((r) => r.ref === ref)?.role;
  return role === "target" || role === "output" ? "продукт" : "сырьё";
}

/**
 * Внешний поток баланса — это продукт расчёта (P…) или что-то сверх них.
 *
 * Модели пишут потоки по-своему: «Нафта (P1)» с обозначением, «Нафта» без
 * длинного пояснения из графа, «метанол» строчными.
 */
export function flowRef(record: BalanceRecord, flowName: string): string | null {
  const explicit = String(flowName).match(/(?<![\p{L}\d])[PpРр]\s*-?\s*(\d{1,3})(?![\d\p{L}])/u);
  if (explicit && record.refs.some((r) => r.ref === `P${explicit[1]}`)) {
    return `P${explicit[1]}`;
  }
  const want = coreName(flowName);
  return (
    record.refs.find(
      (r) =>
        isP(r) && (sameName(r.name, flowName) || (want !== "" && coreName(r.name) === want)),
    )?.ref ?? null
  );
}

/** Количество опорного сырья, с которым считала модель, в кг. */
function basisKg(record: BalanceRecord): number {
  const kg = record.basisAmount?.kg;
  return typeof kg === "number" && kg > 0 ? kg : 1000;
}

/**
 * Масса по расчёту модели — на то количество опорного сырья, с которым она
 * считала: из «Результатов по продуктам», иначе из внешних потоков баланса
 * по названию. Опорное сырьё — заданное количество по определению.
 */
export function recipeMass(record: BalanceRecord, ref: string): BalanceAmount | null {
  const row = record.products.find((p) => p.ref === ref);
  if (row?.massKg) return row.massKg;
  const r = record.refs.find((x) => x.ref === ref);
  if (r?.role === "basis") {
    const kg = basisKg(record);
    return { min: kg, max: kg, approx: false };
  }
  const flow = record.flows.find((f) => flowRef(record, f.name) === ref);
  return flow?.massKg ?? null;
}

const kgOf = (a: BalanceInputAmount | null | undefined) =>
  a && a.amount !== null && a.amount > 0 ? a.amount * UNIT_KG[a.unit] : null;

const times = (a: BalanceAmount, f: BalanceAmount): BalanceAmount => ({
  min: a.min * f.min,
  max: a.max * f.max,
  approx: a.approx || f.approx,
});

/** Сырьё или продукт расчёта на количество человека. */
export interface BalanceFlowResult {
  ref: string;
  /** Узел графа; нет — на графе такого уже нет. */
  nodeId: string | undefined;
  name: string;
  role: BalanceRef["role"];
  /** Сырьё — сколько расходуется, продукт — сколько получится; кг. */
  mass: BalanceAmount | null;
  /** В чём показывать: у сырья — его единица, у продуктов — общая. */
  unit: BalanceUnit;
  /** Количество сырья, как его задали; у продуктов и «сколько нужно» — null. */
  set: BalanceInputAmount | null;
  /** Сырьё сверх нужного: задано больше, чем расходуется. */
  excess: BalanceAmount | null;
  /** Это сырьё ограничивает выход. */
  limiting: boolean;
  /** Количество задано, а расхода в расчёте нет — в пересчёт не вошло. */
  noRecipe: boolean;
}

export interface BalanceResult {
  /** Во сколько раз больше или меньше, чем считала модель; null — не из чего. */
  factor: BalanceAmount | null;
  inputs: BalanceFlowResult[];
  targets: BalanceFlowResult[];
  /** Невыбранные выходы: их массы, если модель всё же дала. */
  outputs: BalanceFlowResult[];
  limitingRef: string | null;
  /** В какой единице показывать продукты: как у лимитирующего сырья. */
  unit: BalanceUnit;
}

/**
 * Пересчёт расчёта на количества человека.
 *
 * Для каждого сырья с заданным количеством — во сколько раз его больше, чем
 * в расчёте модели; самое малое отношение — у лимитирующего сырья, на него
 * и умножаются все массы. Остальное заданное сырьё расходуется не целиком —
 * остаток показывается. Сырьё без количества — «сколько нужно» по рецепту.
 */
export function computeBalance(
  calc: Pick<MaterialBalanceCalc, "record" | "nodeIds" | "amounts" | "view">,
): BalanceResult {
  const { record } = calc;
  const amounts = amountsOf(calc);
  const ins = inputRefs(record);
  const candidates: Array<{ ref: string; f: BalanceAmount }> = [];
  for (const r of ins) {
    const kg = kgOf(amounts[r.ref]);
    const rec = recipeMass(record, r.ref);
    if (kg === null || !rec || rec.min <= 0) continue;
    candidates.push({ ref: r.ref, f: { min: kg / rec.max, max: kg / rec.min, approx: rec.approx } });
  }
  let factor: BalanceAmount | null = null;
  let limitingRef: string | null = null;
  if (candidates.length) {
    const mid = (f: BalanceAmount) => (f.min + f.max) / 2;
    const limiting = candidates.reduce((a, b) => (mid(b.f) < mid(a.f) ? b : a));
    limitingRef = limiting.ref;
    const min = Math.min(...candidates.map((c) => c.f.min));
    const max = Math.min(...candidates.map((c) => c.f.max));
    // Оценка — если оценкой было то сырьё, что может оказаться лимитирующим.
    const approx = candidates.some((c) => c.f.approx && c.f.min <= max);
    factor = { min, max, approx };
  }
  // Продукты — в единице лимитирующего сырья: оно задаёт масштаб («1,2 кг
  // аммиака» — продукта граммы и килограммы, а не «0,002 т»).
  const unit =
    (limitingRef ? amounts[limitingRef]?.unit : undefined) ??
    ins.map((r) => amounts[r.ref]).find((a) => kgOf(a) !== null)?.unit ??
    "т";

  const flow = (r: BalanceRef): BalanceFlowResult => {
    const rec = recipeMass(record, r.ref);
    const base = {
      ref: r.ref,
      nodeId: calc.nodeIds[r.ref],
      name: r.name,
      role: r.role,
      unit: isInputRole(r) ? (amounts[r.ref]?.unit ?? unit) : unit,
      set: null,
      excess: null,
      limiting: false,
      noRecipe: false,
    };
    if (!isInputRole(r)) return { ...base, mass: rec && factor ? times(rec, factor) : null };
    const a = amounts[r.ref];
    const kg = kgOf(a);
    if (kg === null) return { ...base, mass: rec && factor ? times(rec, factor) : null };
    const set = a as BalanceInputAmount;
    if (!rec || rec.min <= 0) return { ...base, set, mass: null, noRecipe: true };
    if (r.ref === limitingRef) {
      return { ...base, set, limiting: true, mass: { min: kg, max: kg, approx: false } };
    }
    const mass = factor ? times(rec, factor) : null;
    let excess: BalanceAmount | null = null;
    if (mass) {
      const lo = Math.max(0, kg - mass.max);
      const hi = Math.max(0, kg - mass.min);
      // Меньше полупроцента — тоже лимитирует, остатка нет.
      if (hi > kg * 0.005) excess = { min: lo, max: hi, approx: mass.approx };
    }
    return { ...base, set, mass, excess };
  };

  return {
    factor,
    inputs: ins.map(flow),
    targets: targetRefs(record).map(flow),
    outputs: otherOutputRefs(record).map(flow),
    limitingRef,
    unit,
  };
}

/** Масса потока «как считала модель» (поток баланса) на количество человека. */
export function scaleByFactor(
  amount: BalanceAmount | null,
  factor: BalanceAmount | null,
): BalanceAmount | null {
  return amount && factor ? times(amount, factor) : null;
}

const NUMBER = new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 3 });

/** «820 кг», «≈1,54 т», «150–200 кг», «нет данных». */
export function formatMass(amount: BalanceAmount | null, unit: BalanceUnit): string {
  if (!amount) return "нет данных";
  const k = UNIT_KG[unit];
  const lo = NUMBER.format(amount.min / k);
  const hi = NUMBER.format(amount.max / k);
  const value = lo === hi ? lo : `${lo}–${hi}`;
  return `${amount.approx ? "≈" : ""}${value} ${unit}`;
}

const AMOUNT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });

/** Количество человека: «1 т», «2,5 тыс. т». */
export const formatView = (view: { amount: number | null; unit: BalanceUnit }) =>
  `${AMOUNT.format(view.amount ?? 0)} ${view.unit}`;

/** «5 т», «2500 кг» — количество, с которым считала модель. */
export function formatBasisAmount(record: BalanceRecord): string {
  const b = record.basisAmount;
  if (!b) return "1 т";
  const unit = (BALANCE_UNITS as string[]).includes(b.unit) ? (b.unit as BalanceUnit) : "кг";
  return formatView({ amount: unit === "кг" ? b.kg : b.amount, unit });
}

/**
 * Коэффициент «на единицу массы» долей: «0,92 кг/кг», «0,92 т/т» — 0,92;
 * «920 кг/т» — 0,92. Другие единицы (%, м³/т, моль) — null.
 */
export function massFraction(
  c: Pick<BalanceCoefficient, "value" | "unit">,
): BalanceAmount | null {
  if (!c.value) return null;
  const unit = c.unit.replace(/\s+/g, "").toLowerCase();
  const k = /^(кг\/кг|т\/т|г\/г|kg\/kg|t\/t|g\/g)$/.test(unit)
    ? 1
    : /^(кг\/т|kg\/t)$/.test(unit)
      ? 0.001
      : null;
  if (k === null) return null;
  return { min: c.value.min * k, max: c.value.max * k, approx: c.value.approx };
}

/** «92 %», «≈92–95 %» — доля процентами. */
export function formatPercent(share: BalanceAmount): string {
  const lo = NUMBER.format(share.min * 100);
  const hi = NUMBER.format(share.max * 100);
  return `${share.approx ? "≈" : ""}${lo === hi ? lo : `${lo}–${hi}`} %`;
}

/**
 * Массовый выход продукта на сырьё: масса продукта на массу сырья по
 * расчёту модели. От количества не зависит. Нет масс — null.
 */
export function massYield(record: BalanceRecord, productRef: string, inputRef: string): BalanceAmount | null {
  const p = recipeMass(record, productRef);
  const i = recipeMass(record, inputRef);
  if (!p || !i || i.min <= 0) return null;
  return { min: p.min / i.max, max: p.max / i.min, approx: p.approx || i.approx };
}

/** Доля продукта во всём сырье расчёта; не у всего сырья есть масса — null. */
export function shareOfAllInputs(record: BalanceRecord, productRef: string): BalanceAmount | null {
  const p = recipeMass(record, productRef);
  const ins = inputRefs(record).map((r) => recipeMass(record, r.ref));
  if (!p || !ins.length || ins.some((m) => !m)) return null;
  const sum = ins.reduce<BalanceAmount>(
    (acc, m) => ({ min: acc.min + m!.min, max: acc.max + m!.max, approx: acc.approx || m!.approx }),
    { min: 0, max: 0, approx: false },
  );
  if (sum.min <= 0) return null;
  return { min: p.min / sum.max, max: p.max / sum.min, approx: p.approx || sum.approx };
}

/**
 * Выход прежнего расчёта пары: продукт (P2) на сырьё (P1), иначе строка
 * «Коэффициентов переходов» P1 → P2 в «кг/кг», «т/т» или процентах.
 */
export function pairYield(record: BalanceRecord): BalanceAmount | null {
  const y = massYield(record, "P2", "P1");
  if (y) return y;
  for (const c of record.coefficients ?? []) {
    if (c.fromRef !== "P1" || c.toRef !== "P2" || !c.value) continue;
    const share = massFraction(c);
    if (share) return share;
    if (/^%/.test(c.unit.trim()) && !/об/i.test(c.unit)) {
      return { min: c.value.min / 100, max: c.value.max / 100, approx: c.value.approx };
    }
  }
  return null;
}

/** «Преобразование → Продукт 1, Продукт 2» по узлам этого графа. */
export function calcProductsLabel(
  calc: MaterialBalanceCalc,
  labelOf: (id: string | undefined) => string,
): string {
  return targetRefs(calc.record)
    .map((r) => labelOf(calc.nodeIds[r.ref]) || r.name)
    .join(", ");
}

export interface BalanceSelection {
  transformationId: string;
  /** Открытый расчёт (номер записи); null — форма нового расчёта. */
  recordId: number | null;
  /** Продукт, в чей расчёт провалились (id узла). */
  productId: string | null;
}

/**
 * Что открыть у преобразования: prefer (выбранный раньше расчёт), если он
 * у него есть, иначе свежий расчёт, иначе форма нового.
 */
export function selectionFor(
  node: CustomNode | undefined,
  transformationId: string,
  prefer?: number | null,
): BalanceSelection {
  const calcs = calcsOf(node);
  const calc = calcs.find((c) => c.record.id === prefer) ?? calcs[0];
  return { transformationId, recordId: calc?.record.id ?? null, productId: null };
}

/**
 * Тон подписи на узле: заданное количество сырья — тёмная, посчитанная
 * масса — синяя, роль без массы — светлая.
 */
export type BalancePillTone = "basis" | "mass" | "role";

export interface BalancePillData {
  text: string;
  tone: BalancePillTone;
}

/**
 * Подсветка связи «сырьё — преобразование — продукт»: active — расчёт, чьи
 * числа на узлах (выбранный или открытый); pending — выбранное, ещё не
 * посчитанное; calc — прочие посчитанные; plain — просто не приглушать.
 */
export type BalanceEdgeTone = "active" | "pending" | "calc" | "plain";

const EDGE_RANK: Record<BalanceEdgeTone, number> = { active: 3, pending: 2, calc: 1, plain: 0 };

/** Ключ связи по её концам: направление связи неважно. */
export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Что режим баланса рисует на полотне. */
export interface BalanceLayer {
  /** Узлы, которые остаются яркими; остальные приглушаются. Пусто — никого. */
  lit: Set<string>;
  /**
   * Подписи на продуктах. Сверху — «продукт · ≈0,82 т»: в верх узла входит
   * связь от преобразования, которое его дало. Снизу — «сырьё · 1 т»: от
   * низа связь уходит к следующему преобразованию. Продукт одного расчёта,
   * ставший сырьём следующего, несёт обе.
   */
  pills: Map<string, { top?: BalancePillData; bottom?: BalancePillData }>;
  /** Выход продукта на преобразованиях с расчётами: «выход ≈92 %». */
  coefficients: Map<string, { text: string; title: string }>;
  /** Подсветка связей по edgeKey концов; нет в списке — приглушить. */
  edges: Map<string, BalanceEdgeTone>;
  /** Расчёт, чьи числа на узлах полностью, с прочими входами и выходами. */
  shown: { nodeId: string; calc: MaterialBalanceCalc } | null;
}

/**
 * Расчёт, чьи числа на узлах и во вкладке.
 *
 * Выбрано преобразование — открытый у него расчёт (форма нового — ничего,
 * только подсветка выбора). Ничего не выбрано — открытый во вкладке
 * последним, иначе свежий расчёт графа.
 */
export function shownCalcFor(args: {
  nodes: CustomNode[];
  selection: BalanceSelection | null;
  active: { nodeId: string; recordId: number } | null;
}): { nodeId: string; calc: MaterialBalanceCalc } | null {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  if (sel) {
    const calc = calcsOf(byId.get(sel.transformationId)).find(
      (c) => c.record.id === sel.recordId,
    );
    return calc ? { nodeId: sel.transformationId, calc } : null;
  }
  if (args.active) {
    const calc = calcsOf(byId.get(args.active.nodeId)).find(
      (c) => c.record.id === args.active!.recordId,
    );
    if (calc) return { nodeId: args.active.nodeId, calc };
  }
  return allCalcs(args.nodes)[0] ?? null;
}

/** Черновик формы: количество по id узла сырья, выбранные продукты. */
export interface BalanceDraftView {
  amounts: Record<string, BalanceInputAmount>;
  /** Опорное сырьё формы (id узла). */
  basisId?: string | null;
  /** id выбранных продуктов; null — все. */
  targets: string[] | null;
}

/**
 * Режим «Материальный баланс» на полотне.
 *
 * На узлах — все посчитанные расчёты графа: у сырья снизу «сырьё · 1 т»
 * (заданное) или «сырьё · ≈0,48 т» (сколько нужно), у продуктов сверху
 * «продукт · ≈0,82 т», их связи с преобразованием подсвечены. Продукт,
 * ставший сырьём следующего расчёта, несёт обе подписи.
 *
 * Расчёт в фокусе (shownCalcFor) показан целиком — с невыбранными выходами,
 * — и его связи выделены сильнее; открыт расчёт продукта — сильнее только
 * его связь. Пока у выбранного преобразования открыта форма нового расчёта,
 * у сырья — количество из формы, у выбранных продуктов — «?», связи —
 * пунктиром.
 *
 * Одно место на узле — одна подпись: в фокусе важнее прочих, посчитанное —
 * важнее роли, из прочих — свежий расчёт.
 */
export function balanceLayer(args: {
  nodes: CustomNode[];
  edges: Edge[];
  selection: BalanceSelection | null;
  active: { nodeId: string; recordId: number } | null;
  /** Черновик формы — для подписей до расчёта. */
  draft: BalanceDraftView;
}): BalanceLayer {
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const isProduct = (id: string | null | undefined): id is string =>
    !!id && byId.get(id)?.type === "product";
  const sel =
    args.selection && byId.get(args.selection.transformationId)?.type === "transformation"
      ? args.selection
      : null;
  const shown = shownCalcFor(args);

  const lit = new Set<string>();
  const pills: BalanceLayer["pills"] = new Map();
  const coefficients: BalanceLayer["coefficients"] = new Map();
  const edges: BalanceLayer["edges"] = new Map();

  const put = (id: string, role: "сырьё" | "продукт", pill: BalancePillData) => {
    const slot = role === "продукт" ? "top" : "bottom";
    const cur = pills.get(id) ?? {};
    if (cur[slot]) return;
    pills.set(id, { ...cur, [slot]: pill });
  };
  const link = (a: string, b: string, tone: BalanceEdgeTone) => {
    const key = edgeKey(a, b);
    const cur = edges.get(key);
    if (!cur || EDGE_RANK[tone] > EDGE_RANK[cur]) edges.set(key, tone);
  };
  const nameOf = (f: BalanceFlowResult) =>
    String(byId.get(f.nodeId ?? "")?.data?.label ?? "").trim() || f.name;

  /** Выход продукта на опорное сырьё — один продукт или открытый. */
  const coefficient = (nodeId: string, calc: MaterialBalanceCalc, focusId?: string | null) => {
    if (coefficients.has(nodeId)) return;
    const res = computeBalance(calc);
    const target =
      res.targets.find((t) => focusId && t.nodeId === focusId) ??
      (res.targets.length === 1 ? res.targets[0] : undefined);
    const basis = res.inputs[0];
    if (!target || !basis) return;
    const share = massYield(calc.record, target.ref, basis.ref);
    if (!share) return;
    coefficients.set(nodeId, {
      text: `выход ${formatPercent(share)}`,
      title: `Массовый выход «${nameOf(target)}» на «${nameOf(basis)}»: столько процентов от массы этого сырья получается продуктом (${formatMass(
        { min: share.min * 1000, max: share.max * 1000, approx: share.approx },
        "т",
      )} из 1 т)`,
    });
  };

  /** Подписи и связи одного расчёта. */
  const paint = (nodeId: string, calc: MaterialBalanceCalc, focus: boolean, productId?: string | null) => {
    const res = computeBalance(calc);
    lit.add(nodeId);
    for (const f of res.inputs) {
      if (!isProduct(f.nodeId)) continue;
      lit.add(f.nodeId);
      link(f.nodeId, nodeId, focus ? "active" : "calc");
      if (f.set) put(f.nodeId, "сырьё", { text: `сырьё · ${formatView(f.set)}`, tone: "basis" });
      else if (f.mass) put(f.nodeId, "сырьё", { text: `сырьё · ${formatMass(f.mass, f.unit)}`, tone: "mass" });
      else if (focus) put(f.nodeId, "сырьё", { text: "сырьё", tone: "role" });
    }
    for (const f of res.targets) {
      if (!isProduct(f.nodeId)) continue;
      lit.add(f.nodeId);
      const strong = focus && (!productId || productId === f.nodeId);
      link(nodeId, f.nodeId, strong ? "active" : "calc");
      put(f.nodeId, "продукт", { text: `продукт · ${formatMass(f.mass, f.unit)}`, tone: "mass" });
    }
    if (focus) {
      for (const f of res.outputs) {
        if (!isProduct(f.nodeId)) continue;
        lit.add(f.nodeId);
        link(nodeId, f.nodeId, "plain");
        put(f.nodeId, "продукт", { text: "продукт", tone: "role" });
      }
    }
    coefficient(nodeId, calc, focus ? productId : null);
  };

  if (shown) {
    paint(shown.nodeId, shown.calc, true, sel?.productId);
  } else if (sel) {
    // Форма нового расчёта у выбранного преобразования.
    lit.add(sel.transformationId);
    const { ins, outs } = balanceEnds(sel.transformationId, args.nodes, args.edges);
    for (const n of ins) {
      const a = args.draft.amounts[n.id];
      if (a && a.amount !== null && a.amount > 0) {
        put(n.id, "сырьё", { text: `сырьё · ${formatView(a)}`, tone: "basis" });
        link(n.id, sel.transformationId, "pending");
      }
    }
    for (const n of outs) {
      if (args.draft.targets && !args.draft.targets.includes(n.id)) continue;
      put(n.id, "продукт", { text: "продукт · ?", tone: "mass" });
      link(sel.transformationId, n.id, "pending");
    }
  }

  // Прочие посчитанные расчёты, свежие первыми. У выбранного преобразования —
  // только открытый расчёт или форма: прежние его расчёты путали бы.
  for (const { nodeId, calc } of allCalcs(args.nodes)) {
    if (shown?.nodeId === nodeId && shown.calc.record.id === calc.record.id) continue;
    if (sel?.transformationId === nodeId) continue;
    paint(nodeId, calc, false);
  }

  // Роли на входах и выходах выбранного преобразования.
  if (sel) {
    lit.add(sel.transformationId);
    const { ins, outs } = balanceEnds(sel.transformationId, args.nodes, args.edges);
    for (const n of ins) {
      lit.add(n.id);
      put(n.id, "сырьё", { text: "сырьё", tone: "role" });
      link(n.id, sel.transformationId, "plain");
    }
    for (const n of outs) {
      lit.add(n.id);
      put(n.id, "продукт", { text: "продукт", tone: "role" });
      link(sel.transformationId, n.id, "plain");
    }
  }

  return { lit, pills, coefficients, edges, shown };
}

/**
 * Почему расчёт не полный — словами модели: её вывод о балансе, иначе
 * первое примечание. У полного расчёта — ничего.
 */
export function statusReason(record: BalanceRecord): string | null {
  if (record.status === "calculated") return null;
  const conclusion = record.totals?.conclusion?.trim();
  if (conclusion) return conclusion;
  const note = (record.sections?.notes ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .find(Boolean);
  return note || null;
}

const SOURCE_ORDER = { local: 0, saved: 1, failed: 2 } as const;

/**
 * Источники по важности: документы базы источников (ИТС), подтверждённые
 * сервером, не подтверждённые. Без проверки (расчёты прежних версий) — как
 * подтверждённые; внутри группы — как у модели.
 */
export const sortSources = (list: BalanceSource[]) =>
  list
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        (a.s.server ? SOURCE_ORDER[a.s.server.status] : 1) -
          (b.s.server ? SOURCE_ORDER[b.s.server.status] : 1) || a.i - b.i,
    )
    .map((x) => x.s);

/** «05.10, 14:32» — когда посчитан расчёт. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Обозначение в тексте модели: «P3», «Р3» кириллицей, «P 3». */
function refPattern(ref: string): RegExp | null {
  const n = /^P(\d+)$/.exec(ref)?.[1];
  return n ? new RegExp(`(?<![\\p{L}\\d])[PpРр]\\s*-?\\s*${n}(?!\\d)`, "u") : null;
}

/**
 * Основы слов названия: «Синильная кислота» → «синильн», «кисло» — текст
 * упоминает продукт, если в нём есть все основы («синильной кислоты»).
 */
function nameStems(name: string): string[] {
  return normalizeProductName(name.replace(/\([^)]*\)/g, " "))
    .split(/[\s-]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, Math.max(4, w.length - 2)));
}

/** Упоминает ли текст продукт расчёта — по обозначению или названию. */
export function mentionsProduct(text: string, ref: string, names: string[]): boolean {
  const re = refPattern(ref);
  if (re?.test(text)) return true;
  const lower = normalizeProductName(text);
  return names.some((n) => {
    const stems = nameStems(n);
    return stems.length > 0 && stems.every((s) => lower.includes(s));
  });
}

/** Пункты поля: строки списка, а одна длинная строка — по «; ». */
export function fieldItems(text: string): string[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const items = lines.length === 1 ? lines[0].split(/;\s+/) : lines;
  return items.map((s) => s.replace(/[;.]\s*$/, "").trim()).filter(Boolean);
}

/** Поля расчёта, где модель пишет о каждом продукте отдельно. */
const PER_PRODUCT_FIELDS = /^(выходные потоки|коэффициент|расч[её]т$|расч[её]т\b)/i;

/**
 * Расчёт одного продукта из ответа модели: пункты полей «Выходные потоки»,
 * «Коэффициенты» и «Расчёт», где он упомянут, — по каждому преобразованию.
 */
export function productExcerpts(
  record: BalanceRecord,
  ref: string,
  names: string[],
): Array<{ label: string; items: string[] }> {
  const out: Array<{ label: string; items: string[] }> = [];
  for (const step of record.steps ?? []) {
    for (const f of step.fields) {
      if (!PER_PRODUCT_FIELDS.test(f.label.trim())) continue;
      const items = fieldItems(f.text).filter((s) => mentionsProduct(s, ref, names));
      if (items.length) out.push({ label: f.label, items });
    }
  }
  return out;
}

/** Поле стадии по началу метки: «Источник и условия», «Входные потоки». */
export function stepField(record: BalanceRecord, label: string): string[] {
  const want = label.toLowerCase();
  return (record.steps ?? []).flatMap((s) =>
    s.fields.filter((f) => f.label.toLowerCase().startsWith(want)).map((f) => f.text),
  );
}
