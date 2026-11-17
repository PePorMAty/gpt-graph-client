// Контекст продукта из графа — что о нём известно кроме названия.
//
// По одному названию модель путается: «Нейлон 6,6» — гранулы или волокно,
// «Двигатель» — автомобиля или самолёта. В графе ответ обычно есть: описание
// узла, отрасль и назначение, CAS, техописание шага, соседи и путь вниз до
// изделия. Первым его берёт определение кодов ОКПД2/ТН ВЭД; тот же срез
// графа — под чат с ИИ на полотне (сервер, PG-MIGRATION.md, этап 5).
//
// Форма — как ждёт сервер (routes/shared/productContext.js): он же обрезает
// строки и списки и укладывает текст в бюджет, клиент лишь не шлёт лишнего.
// Старый сервер поле не знает и просто его не читает.

import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../types";
import { balanceEnds } from "./materialBalance";
import { plural } from "./plural";

export interface ProcessContext {
  /** Название преобразования. */
  name: string;
  /** Техописание шага или описание узла преобразования. */
  description?: string;
  inputs: string[];
  outputs: string[];
}

export interface ProductContext {
  description?: string;
  industry?: string;
  mainPurpose?: string;
  cas?: string;
  /** Как продукт получают: преобразования, где он — выход. */
  madeBy?: ProcessContext[];
  /** Во что он идёт: преобразования, где он — вход. */
  usedIn?: ProcessContext[];
  /** Пути дальше по цепочке, до изделия: [["Двигатель", "Самолёт"]]. */
  downstream?: string[][];
}

const MAX_PROCESSES = 4;
const MAX_TEXT = 400;
const MAX_PATHS = 3;
const MAX_DEPTH = 4;

const text = (v: unknown, max = MAX_TEXT) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Связи графа, собранные один раз на вызов: для каждого продукта —
 * преобразования, где он вход и где выход. Альтернативы (ещё не
 * построенные варианты) не в счёт: это не то, что с продуктом делают на
 * этом графе.
 */
function graphIndex(nodes: CustomNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isTransformation = (id: string) => {
    const n = byId.get(id);
    return n?.type === "transformation" && n.data?.chainVariant !== "alt";
  };
  const linked = new Map<string, Set<string>>();
  for (const e of edges) {
    for (const [p, t] of [
      [e.source, e.target],
      [e.target, e.source],
    ]) {
      if (!isTransformation(t) || isTransformation(p)) continue;
      if (!linked.has(p)) linked.set(p, new Set());
      linked.get(p)!.add(t);
    }
  }
  const ends = new Map<string, { ins: string[]; outs: string[] }>();
  const endsOf = (t: string) => {
    if (!ends.has(t)) {
      const r = balanceEnds(t, nodes, edges);
      ends.set(t, { ins: r.ins.map((n) => n.id), outs: r.outs.map((n) => n.id) });
    }
    return ends.get(t)!;
  };
  const label = (id: string) => text(byId.get(id)?.data?.label, 120);
  return { byId, linked, endsOf, label };
}

/** Описание шага: техописание (2–4 предложения) лучше общего описания узла. */
function processDescription(t: CustomNode | undefined): string {
  const d = t?.data;
  return text(d?.techDescriptionDown || d?.techDescriptionUp || d?.techDescription || d?.description);
}

/**
 * Контекст продукта nodeId по графу. Пустой (у одинокого узла без описания)
 * — null: слать нечего.
 */
export function productContext(nodeId: string, nodes: CustomNode[], edges: Edge[]): ProductContext | null {
  const g = graphIndex(nodes, edges);
  const node = g.byId.get(nodeId);
  if (!node) return null;
  const d = node.data ?? {};
  const ctx: ProductContext = {};
  const description = text(d.description, 600);
  if (description) ctx.description = description;
  if (d.industry) ctx.industry = text(d.industry, 120);
  if (d.mainPurpose) ctx.mainPurpose = text(d.mainPurpose);
  if (d.productIdSource === "cas" && d.productId) ctx.cas = text(d.productId, 20);

  const madeBy: ProcessContext[] = [];
  const usedIn: ProcessContext[] = [];
  for (const t of g.linked.get(nodeId) ?? []) {
    const { ins, outs } = g.endsOf(t);
    const side = outs.includes(nodeId) ? madeBy : ins.includes(nodeId) ? usedIn : null;
    if (!side) continue;
    const process: ProcessContext = {
      name: g.label(t),
      inputs: ins.map(g.label).filter(Boolean),
      outputs: outs.map(g.label).filter(Boolean),
    };
    const pd = processDescription(g.byId.get(t));
    if (pd) process.description = pd;
    side.push(process);
  }
  if (madeBy.length) ctx.madeBy = madeBy.slice(0, MAX_PROCESSES);
  if (usedIn.length) ctx.usedIn = usedIn.slice(0, MAX_PROCESSES);

  // Куда цепочка ведёт дальше: деталь → узел → изделие. Ближайший шаг уже
  // в usedIn, поэтому пути — от двух звеньев.
  const paths: string[][] = [];
  const walk = (from: string, path: string[], seen: Set<string>) => {
    if (paths.length >= MAX_PATHS) return;
    const next = [...(g.linked.get(from) ?? [])].flatMap((t) => {
      const { ins, outs } = g.endsOf(t);
      return ins.includes(from) ? outs.filter((o) => !seen.has(o)) : [];
    });
    if (!next.length || path.length >= MAX_DEPTH) {
      if (path.length >= 2) paths.push(path.map(g.label));
      return;
    }
    for (const o of next) walk(o, [...path, o], new Set([...seen, o]));
  };
  walk(nodeId, [], new Set([nodeId]));
  if (paths.length) ctx.downstream = paths;

  return Object.keys(ctx).length ? ctx : null;
}

/** Во что продукт идёт и из чего его делают — названия по контексту. */
export function contextNeighbours(ctx: ProductContext | null, own: string) {
  const other = (list: string[]) =>
    [...new Set(list)].filter((x) => x && x.toLowerCase() !== own.trim().toLowerCase()).slice(0, 6);
  return {
    usedFor: other((ctx?.usedIn ?? []).flatMap((p) => p.outputs)),
    madeFrom: other((ctx?.madeBy ?? []).flatMap((p) => p.inputs)),
  };
}

/** Что из контекста увидит модель — коротко, для окна: «описание, 2 процесса рядом, путь до «Шина»». */
export function contextSummary(ctx: ProductContext | null): string {
  if (!ctx) return "";
  const processes = (ctx.madeBy?.length ?? 0) + (ctx.usedIn?.length ?? 0);
  const ends = [...new Set((ctx.downstream ?? []).map((p) => p[p.length - 1]))];
  return [
    ctx.description ? "описание" : "",
    ctx.cas ? `CAS ${ctx.cas}` : "",
    processes ? `${processes} ${plural(processes, "процесс", "процесса", "процессов")} рядом` : "",
    ends.length ? `путь до «${ends.join("», «")}»` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
