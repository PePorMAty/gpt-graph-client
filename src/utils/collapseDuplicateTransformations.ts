// src/utils/collapseDuplicateTransformations.ts
//
// Одинаковые преобразования — один узел.
//
//  • alt-узел (вариант шага, data.chainVariant === "alt"): дубль = тот же
//    анкор-продукт (chainRootNodeId) + направление (stepAltDirection) + та же
//    «суть» (alternativeKey по входам/выходам из описания);
//  • обычное преобразование: дубль = то же название и тот же процесс по
//    сырью и продуктам (sameProcess). Продукты дублей складываются в один
//    узел: «Этан → Пиролиз → Этилен» и «Этан → Пиролиз → Пропилен» — один
//    «Пиролиз» с двумя продуктами.
//
// Сырьё и продукты берутся из смысла связей (edge.data.tFlow, edgeFlow.ts), а
// не из направления рёбер: шаг «вверх» кладёт рёбра от якоря — против хода
// производства, — и раньше одно и то же преобразование, построенное шагом
// «вниз» от сырья и шагом «вверх» от продукта, выглядело двумя разными.
//
// Применяется при объединении графов (после схлопывания продуктов и ремапа
// chainRootNodeId), при раскладке полотна по кнопке и к графу, построенному
// по запросу. При построении шага то же правило решает, переиспользовать ли
// преобразование, уже стоящее на полотне (stepToFlow).

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { alternativeKey } from "./parseAlternatives";
import { normalizeProductName } from "./normalizeProductName";
import { inferTFlow, productTransformationEnds, tFlowOf } from "./edgeFlow";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Сырьё и продукты преобразования (id узлов-продуктов). */
export interface ProcessIO {
  ins: Set<string>;
  outs: Set<string>;
}

/** Сырьё и продукты каждого преобразования — по смыслу связей. */
export function transformationIO(
  nodes: CustomNode[],
  edges: Edge[],
): Map<string, ProcessIO> {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const typeOf = (id: string) => typeById.get(id);
  const io = new Map<string, ProcessIO>();
  for (const e of inferTFlow(nodes, edges)) {
    const ends = productTransformationEnds(e, typeOf);
    const flow = tFlowOf(e);
    if (!ends || !flow) continue;
    let cur = io.get(ends.transformation);
    if (!cur) {
      cur = { ins: new Set(), outs: new Set() };
      io.set(ends.transformation, cur);
    }
    (flow === "in" ? cur.ins : cur.outs).add(ends.product);
  }
  return io;
}

const subset = (a: Set<string>, b: Set<string>) =>
  [...a].every((x) => b.has(x));
const meets = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * Один ли это процесс — при совпавшем названии.
 *
 * - То же сырьё — один процесс, продукты складываются.
 * - Сырьё одного целиком входит в сырьё другого, и есть общий продукт — тоже
 *   один: «Этан → Пиролиз → Этилен» и «Этан, Пар → Пиролиз → Этилен,
 *   Пропилен» (второй шаг назвал ещё и пар).
 * - Разное сырьё — разные процессы, даже с общим реагентом и общим попутным
 *   продуктом: «Хлор, Метан → Хлорирование» и «Хлор, Бензол → Хлорирование».
 * - Без сырья вовсе — только при тех же продуктах.
 * - Продукт не может стать сразу и сырьём, и продуктом слитого узла.
 */
export function sameProcess(a: ProcessIO, b: ProcessIO): boolean {
  if (meets(a.ins, b.outs) || meets(b.ins, a.outs)) return false;
  if (!a.ins.size || !b.ins.size) {
    return (
      !a.ins.size &&
      !b.ins.size &&
      a.outs.size > 0 &&
      a.outs.size === b.outs.size &&
      subset(a.outs, b.outs)
    );
  }
  if (a.ins.size === b.ins.size && subset(a.ins, b.ins)) return true;
  return (subset(a.ins, b.ins) || subset(b.ins, a.ins)) && meets(a.outs, b.outs);
}

const isBlank = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && v.length === 0);

export function collapseDuplicateTransformations(
  nodes: CustomNode[],
  edges: Edge[],
): {
  nodes: CustomNode[];
  edges: Edge[];
  /** Названия слитых (убранных) узлов — для истории и отчёта. */
  collapsed: string[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const marked = inferTFlow(nodes, edges);
  const io = transformationIO(nodes, marked);

  const idRemap: Record<string, string> = {};
  const dropped = new Set<string>();
  const collapsed: string[] = [];
  const altKept = new Map<string, string>();
  // Название → оставленные узлы; у оставленного копится сырьё и продукты
  // слитых в него, чтобы следующий дубль сравнивался уже с суммой.
  const keptByName = new Map<string, string[]>();
  const keptIO = new Map<string, ProcessIO>();

  for (const n of nodes) {
    if (n.type !== "transformation") continue;
    let into: string | undefined;
    if (n.data?.chainVariant === "alt") {
      const root = str(n.data?.chainRootNodeId);
      if (!root) continue; // без анкора группировать нельзя
      const content = alternativeKey({
        fullDescription: str(n.data?.description),
        title: str(n.data?.label),
      });
      if (!content) continue; // суть не определена — не рискуем
      const key = `alt::${root}::${str(n.data?.stepAltDirection)}::${content}`;
      into = altKept.get(key);
      if (!into) altKept.set(key, n.id);
    } else {
      const name = normalizeProductName(str(n.data?.label));
      if (!name) continue;
      const cur = io.get(n.id);
      // Узел без единой связи — заготовка, которую человек ещё заполняет.
      if (!cur || (!cur.ins.size && !cur.outs.size)) continue;
      const kept = keptByName.get(name) ?? [];
      into = kept.find((k) => sameProcess(keptIO.get(k)!, cur));
      if (into) {
        const acc = keptIO.get(into)!;
        cur.ins.forEach((p) => acc.ins.add(p));
        cur.outs.forEach((p) => acc.outs.add(p));
      } else {
        kept.push(n.id);
        keptByName.set(name, kept);
        keptIO.set(n.id, { ins: new Set(cur.ins), outs: new Set(cur.outs) });
      }
    }
    if (into) {
      idRemap[n.id] = into;
      dropped.add(n.id);
      collapsed.push(str(n.data?.label) || n.id);
    }
  }

  if (dropped.size === 0) return { nodes, edges, collapsed };

  // Оставленный узел добирает у слитых то, чего у него нет: описание,
  // заполненную карточку, источники — иначе слияние их бы потеряло.
  const extra = new Map<string, Record<string, unknown>>();
  for (const id of dropped) {
    const into = idRemap[id];
    const keptData = (byId.get(into)?.data ?? {}) as Record<string, unknown>;
    const acc = extra.get(into) ?? {};
    for (const [k, v] of Object.entries(byId.get(id)?.data ?? {})) {
      if (isBlank(keptData[k]) && isBlank(acc[k]) && !isBlank(v)) acc[k] = v;
    }
    extra.set(into, acc);
  }
  const keptNodes = nodes
    .filter((n) => !dropped.has(n.id))
    .map((n) => {
      const add = extra.get(n.id);
      return add && Object.keys(add).length
        ? { ...n, data: { ...n.data, ...add } }
        : n;
    });

  // Рёбра — на оставленный узел. Одна связь продукта с преобразованием — одно
  // ребро, в какую бы сторону ни смотрели рёбра дублей (шаг «вверх» кладёт их
  // от якоря); прочие рёбра — по паре source→target.
  const typeOf = (id: string) => byId.get(id)?.type;
  const seen = new Set<string>();
  const keptEdges: Edge[] = [];
  for (const e of marked) {
    const source = idRemap[e.source] ?? e.source;
    const target = idRemap[e.target] ?? e.target;
    if (source === target) continue;
    const next =
      source === e.source && target === e.target ? e : { ...e, source, target };
    const ends = productTransformationEnds(next, typeOf);
    const key = ends
      ? `pt:${ends.product}|${ends.transformation}|${tFlowOf(next) ?? ""}`
      : `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    keptEdges.push(next);
  }

  return { nodes: keptNodes, edges: keptEdges, collapsed };
}
