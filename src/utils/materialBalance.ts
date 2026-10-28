// src/utils/materialBalance.ts
//
// Материальный баланс на клиенте: где лежат расчёты, как показать их в
// массовых процентах и что написать на узлах.
//
// Расчёт — преобразование целиком: всё его сырьё и выбранные продукты.
// Модель считает на 1 т одного сырья (опорного) и даёт массы остального
// сырья и каждого продукта. Человек видит только проценты массы: сырьё —
// 100 %, продукт — 100 %, прочее — отдельно (percentBalance). Проценты
// правятся вручную, каждый сам по себе: правка одного ничего не
// пересчитывает (MaterialBalanceCalc.shares).
//
// Прежние расчёты — пара «сырьё → продукт» на 1 т сырья — тот же вид с одним
// продуктом: читаются тем же кодом.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import type {
  BalanceAmount,
  BalanceCoefficient,
  BalanceFlow,
  BalanceRecord,
  BalanceRef,
  BalanceSource,
  BalanceStatus,
} from "../store/api/material-balance-api";
import { inferTFlow, productTransformationEnds, tFlowOf, type TFlow } from "./edgeFlow";
import { normalizeProductName } from "./normalizeProductName";

/**
 * Проценты, поправленные вручную: по ключу строки баланса (PercentRow.key)
 * — число процентов, «64,5 %» — 64.5.
 */
export type BalanceShares = Record<string, number>;

/**
 * Расчёт в графе. Лежит в данных узла преобразования (materialBalances) и
 * сохраняется с графом — поэтому виден и по ссылке, и после перезагрузки.
 *
 * Прежние версии хранили здесь и количества сырья (amounts, view) для
 * пересчёта на тонны — пересчёта больше нет, эти поля не читаются.
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
  /** Проценты, поправленные вручную; нет — все как посчитала модель. */
  shares?: BalanceShares;
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
 * Сырьё названо в самой технологии: «Окислительный аммонолиз пропилена» —
 * пропилен, «Паровой риформинг природного газа» — природный газ. Каждое
 * слово названия сырья (от четырёх букв) — основой в начале слова названия
 * технологии; «аммиак» в «аммонолизе» не узнаётся: основы разные.
 */
function namedInTitle(transformation: string, name: string): boolean {
  const title = normalizeProductName(transformation);
  const words = normalizeProductName(name)
    .split(/[\s-]+/)
    .filter((w) => w.length >= 4);
  if (!words.length) return false;
  return words.every((w) => {
    const stem = w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^а-яёa-z0-9])${stem}`, "i").test(title);
  });
}

/**
 * Опорное сырьё по умолчанию — основное сырьё процесса: названное в самой
 * технологии («…аммонолиз пропилена» — пропилен), иначе первое (с большим
 * числом связей), если оно не вспомогательное, иначе первое
 * невспомогательное. От количества растворителя («ректификация с
 * ацетонитрилом») модель выход продукта не найдёт.
 *
 * Название технологии — первым: число связей обманывает. Аммиак, который
 * идёт в несколько шагов графа, набирал связей больше пропилена и вставал
 * опорным в аммонолизе пропилена; модель тогда приложила выход на пропилен
 * к тонне аммиака, и акрилонитрила вышло втрое меньше.
 */
export function defaultBasisId(transformation: CustomNode | undefined, ins: CustomNode[]): string | null {
  const tLabel = String(transformation?.data?.label ?? "");
  const label = (n: CustomNode) => String(n.data?.label ?? "");
  const aux = (n: CustomNode) =>
    AUXILIARY.test(normalizeProductName(label(n))) || namedAsAgent(tLabel, label(n));
  const main = ins.filter((n) => !aux(n));
  return (main.find((n) => namedInTitle(tLabel, label(n))) ?? main[0] ?? ins[0])?.id ?? null;
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

/** Сырьё или продукт расчёта: обозначение, узел графа, масса по расчёту модели. */
export interface CalcFlow {
  ref: string;
  /** Узел графа; нет — на графе такого уже нет. */
  nodeId: string | undefined;
  name: string;
  role: BalanceRef["role"];
  /** Масса по расчёту модели, кг; модель не дала — null. */
  mass: BalanceAmount | null;
}

/** Сырьё, продукты и невыбранные выходы расчёта — с узлами этого графа. */
export function calcFlows(calc: Pick<MaterialBalanceCalc, "record" | "nodeIds">): {
  inputs: CalcFlow[];
  targets: CalcFlow[];
  outputs: CalcFlow[];
} {
  const { record } = calc;
  const flow = (r: BalanceRef): CalcFlow => ({
    ref: r.ref,
    nodeId: calc.nodeIds[r.ref],
    name: r.name,
    role: r.role,
    mass: recipeMass(record, r.ref),
  });
  return {
    inputs: inputRefs(record).map(flow),
    targets: targetRefs(record).map(flow),
    outputs: otherOutputRefs(record).map(flow),
  };
}

const NUMBER = new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 3 });

/** Процент, вписанный человеком: как вписал, до сотых. */
const EXACT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const AMOUNT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });

const BASIS_UNITS = ["кг", "т", "тыс. т"];

/** «1 т», «2500 кг» — количество опорного сырья, с которым считала модель. */
export function formatBasisAmount(record: BalanceRecord): string {
  const b = record.basisAmount;
  if (!b) return "1 т";
  const unit = BASIS_UNITS.includes(b.unit) ? b.unit : "кг";
  return `${AMOUNT.format(unit === "кг" ? b.kg : b.amount)} ${unit}`;
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

/** Строка баланса в процентах. */
export interface PercentRow {
  /**
   * Ключ строки для правки (MaterialBalanceCalc.shares): обозначение (P1…),
   * у потока сверх графа — его номер в расчёте (flowShareKey).
   */
  key: string;
  /** Обозначение сырья или продукта расчёта (P1…); поток сверх графа — null. */
  ref: string | null;
  name: string;
  kind: "input" | "target" | "off" | FlowKind;
  /** Масса по расчёту модели, кг; модель не дала — null. */
  mass: BalanceAmount | null;
  /**
   * Доля по расчёту модели: у сырья — от всего сырья, у продукта — от всех
   * продуктов расчёта, у прочего — от массы продуктов. Нет массы — null.
   */
  model: BalanceAmount | null;
  /** Доля в таблице и на узле: поправленная вручную, иначе — модели. */
  share: BalanceAmount | null;
  /** Доля поправлена вручную. */
  edited: boolean;
}

/**
 * Ключ строки потока сверх графа — его номер в расчёте: название модели
 * для показа чистится (readableRecord), а номер тот же.
 */
export const flowShareKey = (index: number) => `flow:${index}`;

export interface PercentBalance {
  /** Сырьё расчёта (с графа): доли между собой, вместе — 100 %. */
  raw: PercentRow[];
  /** Продукты расчёта: доли между собой, вместе — 100 %. */
  products: PercentRow[];
  /**
   * Отдельно, вне этих 100 %: реагенты сверх графа (кислород, вода),
   * невыбранные выходы, побочные продукты, отходы, потери — в процентах от
   * массы продуктов («на 100 % продукта — 120 % воды»).
   */
  separate: PercentRow[];
  /** Не у всего сырья есть масса: доли модели — от сырья с массой. */
  partialRaw: boolean;
  /** Не у всех продуктов есть масса: доли модели — от продуктов с массой. */
  partialProducts: boolean;
  /** Масс в расчёте нет — модель не дала ни одной доли, их можно только вписать. */
  empty: boolean;
}

const midOf = (a: BalanceAmount) => (a.min + a.max) / 2;
const isRange = (a: BalanceAmount | null) => !!a && (a.approx || a.min !== a.max);

/**
 * Доли модели от суммы масс; «≈», если оценкой была хоть одна масса суммы.
 * Масса в сумме одна — у её строки ровно 100 %, без «≈».
 */
function shareOf(rows: PercentRow[], total: number, approx: boolean) {
  const withMass = rows.filter((r) => r.mass);
  if (withMass.length === 1 && massSum(withMass) === total) {
    withMass[0].model = { min: 1, max: 1, approx: false };
    return;
  }
  for (const r of rows) {
    if (r.mass && total > 0) {
      r.model = { min: r.mass.min / total, max: r.mass.max / total, approx: r.mass.approx || approx };
    }
  }
}

const massSum = (rows: PercentRow[]) => rows.reduce((s, r) => s + (r.mass ? midOf(r.mass) : 0), 0);

/**
 * Материальный баланс в массовых процентах — как его считает заказчик
 * (2026-10-19): сырьё графа вместе — 100 % («64 % пропилена + 36 %
 * аммиака»), продукт — 100 % (несколько продуктов делят эти 100 %), а
 * отходы, побочные продукты, примеси и реагенты сверх графа в эти 100 % не
 * входят — они отдельно, в процентах от массы продукта.
 *
 * Доли модели — по массам её расчёта. Сумма — по серединам диапазонов; доля
 * — оценка («≈»), если оценкой была хоть одна масса суммы: от неё зависит
 * каждая доля.
 *
 * Поправленные вручную (edits) встают вместо долей модели как есть: правка
 * одной строки другие не меняет (2026-10-26), сумма может уйти от 100 % —
 * это видно в «Итого» (shareTotal).
 */
export function percentBalance(
  record: BalanceRecord,
  /** Роль сырья или продукта расчёта по обозначению — с его связи на графе. */
  roleOf?: (ref: string) => BalanceEdgeRole | undefined,
  /** Проценты, поправленные вручную (MaterialBalanceCalc.shares). */
  edits?: BalanceShares,
): PercentBalance {
  const extra = record.flows
    .map((f, i) => ({ f, key: flowShareKey(i) }))
    .filter(({ f }) => !flowRef(record, f.name));
  const row = (
    key: string,
    ref: string | null,
    name: string,
    kind: PercentRow["kind"],
    mass: BalanceAmount | null,
  ): PercentRow => ({ key, ref, name, kind, mass, model: null, share: null, edited: false });
  const byRef = (r: BalanceRef, kind: PercentRow["kind"]) =>
    row(r.ref, r.ref, r.name, kind, recipeMass(record, r.ref));
  const byFlow = ({ f, key }: { f: BalanceFlow; key: string }) =>
    row(key, null, f.name, flowKind(f), f.massKg);
  // Реагент и побочный продукт, поставленные на граф из таблицы, — в
  // «Отдельно», хоть модель и считала их сырьём или продуктом.
  const role = (r: BalanceRef) => roleOf?.(r.ref);
  const raw = inputRefs(record)
    .filter((r) => role(r) !== "reagent")
    .map((r) => byRef(r, "input"));
  const products = targetRefs(record)
    .filter((r) => role(r) !== "byproduct")
    .map((r) => byRef(r, "target"));
  const separate = [
    ...inputRefs(record)
      .filter((r) => role(r) === "reagent")
      .map((r) => byRef(r, "reagent")),
    ...extra.filter(({ f }) => flowKind(f) === "reagent").map(byFlow),
    ...targetRefs(record)
      .filter((r) => role(r) === "byproduct")
      .map((r) => byRef(r, "byproduct")),
    // Невыбранные выходы — с массой; побочный продукт, поставленный из
    // таблицы, — и без неё: его ждут увидеть.
    ...otherOutputRefs(record)
      .map((r) => byRef(r, role(r) === "byproduct" ? "byproduct" : "off"))
      .filter((r) => r.mass || r.kind === "byproduct"),
    ...extra.filter(({ f }) => flowKind(f) !== "reagent").map(byFlow),
  ];
  const rawTotal = massSum(raw);
  if (rawTotal > 0) shareOf(raw, rawTotal, raw.some((r) => isRange(r.mass)));
  const productTotal = massSum(products);
  if (productTotal > 0) {
    const approx = products.some((r) => isRange(r.mass));
    shareOf(products, productTotal, approx);
    shareOf(separate, productTotal, approx);
  }
  const all = [...raw, ...products, ...separate];
  for (const r of all) {
    const v = edits?.[r.key];
    if (typeof v === "number" && Number.isFinite(v)) {
      r.share = { min: v / 100, max: v / 100, approx: false };
      r.edited = true;
    } else {
      r.share = r.model;
    }
  }
  return {
    raw,
    products,
    separate,
    partialRaw: rawTotal > 0 && raw.some((r) => !r.mass),
    partialProducts: productTotal > 0 && products.some((r) => !r.mass),
    empty: !all.some((r) => r.model),
  };
}

/** Строки баланса по ключу (PercentRow.key) — для подписей на узлах и схем. */
export function percentRows(
  record: BalanceRecord,
  roleOf?: (ref: string) => BalanceEdgeRole | undefined,
  edits?: BalanceShares,
): Map<string, PercentRow> {
  const pb = percentBalance(record, roleOf, edits);
  return new Map([...pb.raw, ...pb.products, ...pb.separate].map((r) => [r.key, r]));
}

/** Доля строки: вписанная — как вписали, модели — как у модели («≈64 %»). */
export function formatShare(r: Pick<PercentRow, "share" | "edited">): string {
  if (!r.share) return "нет данных";
  return r.edited ? `${EXACT.format(r.share.min * 100)} %` : formatPercent(r.share);
}

/** Число для поля правки: «64,5» — вписанное или середина доли модели. */
export function shareInputValue(r: Pick<PercentRow, "share" | "edited">): string {
  if (!r.share) return "";
  return r.edited ? EXACT.format(r.share.min * 100) : NUMBER.format(midOf(r.share) * 100);
}

/**
 * Процент из поля правки: «64,5», «64.5 %». Пусто — undefined (вернуть
 * долю модели); не число, меньше нуля или больше 10 000 — null.
 */
export function parseShareInput(text: string): number | null | undefined {
  const t = String(text ?? "").replace(/[\s%]/g, "").replace(",", ".");
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 && v <= 10_000 ? v : null;
}

/**
 * «Итого» группы в процентах: правки другие строки не пересчитывают, и
 * сумма может уйти от 100 %. Долей в группе нет — null.
 */
export function shareTotal(rows: PercentRow[]): { percent: number; approx: boolean } | null {
  const withShare = rows.filter((r) => r.share);
  if (!withShare.length) return null;
  return {
    percent: withShare.reduce((s, r) => s + midOf(r.share!) * 100, 0),
    approx: withShare.some((r) => isRange(r.share)),
  };
}

/** «100 %», «≈89,6 %», «99,25 %» — «Итого» группы. */
export function formatShareTotal(t: { percent: number; approx: boolean }): string {
  if (Math.abs(t.percent - 100) < 0.05) return "100 %";
  return t.approx ? `≈${NUMBER.format(t.percent)} %` : `${EXACT.format(t.percent)} %`;
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
 * Тон подписи на узле: доля по расчёту модели — синяя, поправленная
 * вручную — тёмная, роль без доли — светлая.
 */
export type BalancePillTone = "share" | "edited" | "role";

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
   * Подписи на продуктах. Сверху — «продукт · 100 %»: в верх узла входит
   * связь от преобразования, которое его дало. Снизу — «сырьё · 64 %»: от
   * низа связь уходит к следующему преобразованию. Продукт одного расчёта,
   * ставший сырьём следующего, несёт обе.
   */
  pills: Map<string, { top?: BalancePillData; bottom?: BalancePillData }>;
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

/** Черновик формы: выбранные продукты. */
export interface BalanceDraftView {
  /** id выбранных продуктов; null — все. */
  targets: string[] | null;
}

/**
 * Режим «Материальный баланс» на полотне.
 *
 * На узлах — все посчитанные расчёты графа в массовых процентах: у сырья
 * снизу «сырьё · 64 %», у продуктов сверху «продукт · 100 %», их связи с
 * преобразованием подсвечены. Поправленные вручную проценты — как в
 * таблице. Продукт, ставший сырьём следующего расчёта, несёт обе подписи.
 *
 * Расчёт в фокусе (shownCalcFor) показан целиком — с невыбранными выходами,
 * — и его связи выделены сильнее; открыт расчёт продукта — сильнее только
 * его связь. Пока у выбранного преобразования открыта форма нового расчёта,
 * у выбранных продуктов — «?», связи — пунктиром.
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

  /** Подписи и связи одного расчёта. */
  const paint = (nodeId: string, calc: MaterialBalanceCalc, focus: boolean, productId?: string | null) => {
    const flows = calcFlows(calc);
    const roleOf = (ref: string) => balanceRoleOf(args.edges, calc.nodeIds[ref], nodeId);
    const rows = percentRows(calc.record, roleOf, calc.shares);
    /** «сырьё · 64 %»; доли нет — null. */
    const pill = (word: string, key: string): BalancePillData | null => {
      const r = rows.get(key);
      return r?.share ? { text: `${word} · ${formatShare(r)}`, tone: r.edited ? "edited" : "share" } : null;
    };
    lit.add(nodeId);
    for (const f of flows.inputs) {
      if (!isProduct(f.nodeId)) continue;
      lit.add(f.nodeId);
      link(f.nodeId, nodeId, focus ? "active" : "calc");
      // Реагент, поставленный из таблицы (кислород), подписан реагентом.
      const word = roleOf(f.ref) === "reagent" ? "реагент" : "сырьё";
      const p = pill(word, f.ref);
      if (p) put(f.nodeId, "сырьё", p);
      else if (focus) put(f.nodeId, "сырьё", { text: word, tone: "role" });
    }
    for (const f of flows.targets) {
      if (!isProduct(f.nodeId)) continue;
      lit.add(f.nodeId);
      const strong = focus && (!productId || productId === f.nodeId);
      link(nodeId, f.nodeId, strong ? "active" : "calc");
      const word = roleOf(f.ref) === "byproduct" ? "побочный" : "продукт";
      put(f.nodeId, "продукт", pill(word, f.ref) ?? { text: `${word} · нет данных`, tone: "share" });
    }
    // Потоки сверх расчёта, поставленные на граф из таблицы (вода,
    // кислород): узел с тем же названием у этого преобразования.
    const extra = calc.record.flows
      .map((f, i) => ({ f, key: flowShareKey(i) }))
      .filter(({ f }) => !flowRef(calc.record, f.name));
    if (extra.length) {
      const ends = balanceEnds(nodeId, args.nodes, args.edges);
      for (const { f, key } of extra) {
        const kind = flowKind(f);
        const input = kind === "reagent";
        const n = flowNodeAmong(input ? ends.ins : ends.outs, f.name);
        if (!n) continue;
        lit.add(n.id);
        link(input ? n.id : nodeId, input ? nodeId : n.id, focus ? "active" : "calc");
        put(
          n.id,
          input ? "сырьё" : "продукт",
          pill(FLOW_PILL[kind], key) ?? { text: `${FLOW_PILL[kind]} · нет данных`, tone: "share" },
        );
      }
    }
    // Невыбранные выходы: с долей (побочный продукт, который модель всё же
    // посчитала) — подписаны всегда, без доли — ролью у расчёта в фокусе.
    for (const f of flows.outputs) {
      if (!isProduct(f.nodeId)) continue;
      const word = roleOf(f.ref) === "byproduct" ? "побочный" : "продукт";
      const p = pill(word, f.ref);
      if (!p && !focus) continue;
      lit.add(f.nodeId);
      link(nodeId, f.nodeId, p ? (focus ? "active" : "calc") : "plain");
      put(f.nodeId, "продукт", p ?? { text: word, tone: "role" });
    }
  };

  if (shown) {
    paint(shown.nodeId, shown.calc, true, sel?.productId);
  } else if (sel) {
    // Форма нового расчёта у выбранного преобразования: у сырья — роль (ниже).
    lit.add(sel.transformationId);
    const { outs } = balanceEnds(sel.transformationId, args.nodes, args.edges);
    for (const n of outs) {
      if (args.draft.targets && !args.draft.targets.includes(n.id)) continue;
      put(n.id, "продукт", { text: "продукт · ?", tone: "share" });
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

  return { lit, pills, edges, shown };
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

/** Роль потока баланса сверх сырья и продуктов графа — в таблице баланса. */
export type FlowKind = "reagent" | "byproduct" | "waste" | "loss" | "flow";

export const FLOW_KIND_TEXT: Record<FlowKind, string> = {
  reagent: "реагент",
  byproduct: "побочный продукт",
  waste: "отходы",
  loss: "потери",
  flow: "поток",
};

/**
 * Что за поток: потери — по названию («Технологические потери»), входы —
 * реагенты (воздух, вода, катализатор), выходы — отходы (выбросы, стоки,
 * шлам) или побочные продукты.
 */
export function flowKind(f: Pick<BalanceFlow, "name" | "direction">): FlowKind {
  const n = normalizeProductName(f.name);
  if (/потер/.test(n)) return "loss";
  if (f.direction === "in") return "reagent";
  if (/отход|выброс|сточн|шлам|отходящ|абгаз|дымов/.test(n)) return "waste";
  if (f.direction === "out") return "byproduct";
  return "flow";
}

/** Слово подписи потока на узле — короче, чем в таблице: подпись не должна наезжать на значки узла. */
const FLOW_PILL: Record<FlowKind, string> = {
  reagent: "реагент",
  byproduct: "побочный",
  waste: "отходы",
  loss: "потери",
  flow: "поток",
};

/** Название узла для потока: без пояснения в скобках, с заглавной — «кислород (из воздуха)» → «Кислород». */
export function flowNodeLabel(name: string): string {
  const s = String(name ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Поток сверх графа можно поставить на граф: одно вещество, не потери.
 * «Вода, CO2, Синильная кислота» — несколько веществ одной строкой: одним
 * узлом они стали бы чепухой.
 */
export function placeableFlow(f: Pick<BalanceFlow, "name" | "direction">): boolean {
  const name = flowNodeLabel(f.name);
  return (
    !!name &&
    flowKind(f) !== "loss" &&
    !/[,;]/.test(name) &&
    !/\s(?:и|или)\s/i.test(name) &&
    !GROUP_NAME.test(normalizeProductName(name))
  );
}

/**
 * Название группы, а не вещества: «Побочные продукты», «Прочие примеси»,
 * «Отходы». Узел с таким названием на графе — чепуха. «Отходящие газы» и
 * «Сточные воды» — потоки, их ставить можно.
 */
const GROUP_NAME = /^(?:побочн\S*(?:\s+продукт\S*)?|прочи\S*(?:\s.*)?|други\S*(?:\s.*)?|примес\S*|отходы|выбросы|потери)$/i;

/** Роль продукта у преобразования в балансе — с его связи (balanceRole). */
export type BalanceEdgeRole = "reagent" | "byproduct";

/**
 * Продукт поставлен на граф из таблицы баланса реагентом или побочным
 * продуктом этого преобразования: так помечена связь между ними. В
 * процентах такой продукт — в «Отдельно», а не в сырье или продуктах, и
 * после пересчёта тоже.
 */
export function balanceRoleOf(
  edges: Edge[],
  productId: string | undefined,
  transformationId: string,
): BalanceEdgeRole | undefined {
  if (!productId) return undefined;
  const e = edges.find(
    (x) =>
      (x.source === productId && x.target === transformationId) ||
      (x.source === transformationId && x.target === productId),
  );
  const role = (e?.data as { balanceRole?: unknown } | undefined)?.balanceRole;
  return role === "reagent" || role === "byproduct" ? role : undefined;
}

/** Узел потока: продукт с тем же названием, пояснения в скобках не в счёт. */
export function flowNodeAmong(nodes: CustomNode[], name: string): CustomNode | undefined {
  const want = coreName(name);
  return want ? nodes.find((n) => n.type === "product" && coreName(n.data?.label) === want) : undefined;
}

/**
 * Коэффициенты расчёта — пункты полей «Коэффициенты» всех стадий (новый
 * промпт). У расчётов прежнего промпта — таблица record.coefficients, её
 * показывает сама карточка.
 */
export function coefficientItems(record: BalanceRecord): string[] {
  return stepField(record, "Коэффициент").flatMap(fieldItems);
}

/** Ссылки на источники в конце пункта: «[S1]», «[L1, S2]», «[S1][S3]». */
const TRAILING_REFS = /((?:\s*\(?\[[SL]\s*\d+(?:\s*[,;]\s*[SL]?\s*\d+)*\]\)?)+)\s*\.?\s*$/;

/**
 * Пункт коэффициента — подпись, значение и источники: «Выход акрилонитрила:
 * 0,82 кг/кг пропилена [S1]» → { label: "Выход акрилонитрила", value: "0,82
 * кг/кг пропилена", refs: "[S1]" }. Нет «подписи: значения» — всё в value.
 */
export function splitCoefficient(item: string): { label: string; value: string; refs: string } {
  let text = String(item || "").trim();
  let refs = "";
  const m = TRAILING_REFS.exec(text);
  if (m && m.index > 0) {
    refs = m[1].replace(/[()]/g, "").trim();
    text = text.slice(0, m.index).trim();
  }
  const colon = text.indexOf(": ");
  if (colon > 0 && colon <= 90 && text.slice(colon + 2).trim()) {
    return { label: text.slice(0, colon).trim(), value: text.slice(colon + 2).trim(), refs };
  }
  return { label: "", value: text, refs };
}
