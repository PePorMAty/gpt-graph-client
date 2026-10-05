// src/utils/edgeFlow.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { orientByBuildDirection } from "./orientByBuildDirection";

/**
 * Чем продукт приходится преобразованию на связи между ними: "in" — сырьё
 * (входит в преобразование), "out" — продукт (выходит из него).
 *
 * Лежит в самом ребре (edge.data.tFlow) и не зависит от того, куда ребро
 * смотрит. А смотрят рёбра по-разному: шаг «вверх» строит их от якоря к
 * найденному сырью — против хода производства, — а раскладка разворачивает
 * их по ходу. Раньше смысл связи выводился из направления ребра и расстояния
 * до корня цепочки и на стыке шагов «вниз» и «вверх» выводился неверно: после
 * раскладки шаг «вверх» уезжал вниз, а выход шага «вниз», уже стоящий на
 * полотне выше, цеплялся к верху преобразования, как будто это сырьё.
 */
export type TFlow = "in" | "out";

export function tFlowOf(edge: Edge): TFlow | undefined {
  const flow = (edge.data as { tFlow?: unknown } | undefined)?.tFlow;
  return flow === "in" || flow === "out" ? flow : undefined;
}

export function withTFlow<E extends Edge>(edge: E, flow: TFlow): E {
  return { ...edge, data: { ...(edge.data ?? {}), tFlow: flow } };
}

/** Концы ребра «продукт ↔ преобразование» — или null, если ребро другое. */
export function productTransformationEnds(
  edge: Edge,
  typeOf: (id: string) => string | undefined,
): { product: string; transformation: string } | null {
  const s = typeOf(edge.source);
  const t = typeOf(edge.target);
  if (s === "product" && t === "transformation") {
    return { product: edge.source, transformation: edge.target };
  }
  if (s === "transformation" && t === "product") {
    return { product: edge.target, transformation: edge.source };
  }
  return null;
}

/**
 * Рёбра по ходу производства: сырьё → преобразование → продукт. Трогает только
 * рёбра с tFlow; хэндлы у развёрнутого ребра меняются местами вместе с концами.
 */
export function orientByTFlow(nodes: CustomNode[], edges: Edge[]): Edge[] {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const typeOf = (id: string) => typeById.get(id);
  return edges.map((e) => {
    const flow = tFlowOf(e);
    if (!flow) return e;
    const ends = productTransformationEnds(e, typeOf);
    if (!ends) return e;
    const productIsSource = ends.product === e.source;
    if (productIsSource === (flow === "in")) return e;
    return {
      ...e,
      source: e.target,
      target: e.source,
      sourceHandle: e.targetHandle,
      targetHandle: e.sourceHandle,
    };
  });
}

/**
 * Проставить tFlow рёбрам «продукт ↔ преобразование», у которых его нет:
 * графы, построенные до этой пометки, и графы из файлов.
 *
 * - Там, где orientByBuildDirection знает ход производства, ребро им и
 *   развёрнуто: продукт → преобразование — сырьё, обратно — выход.
 * - Стык шагов «вниз» и «вверх» он не трогает, а такие рёбра всегда лежат так,
 *   как их построил шаг, — от якоря. Смысл тогда по направлению шага: у шага
 *   «вверх» якорь — его продукт, найденное — сырьё; у шага «вниз» наоборот.
 * - Без меток шагов (цепочка целиком, файл, ручная связь) ребро уже идёт по
 *   ходу производства.
 */
export function inferTFlow(nodes: CustomNode[], edges: Edge[]): Edge[] {
  if (!edges.some((e) => !tFlowOf(e))) return edges;
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const typeOf = (id: string) => typeById.get(id);
  const dirOf = new Map(
    nodes.map((n) => [
      n.id,
      (n.data?.chainDirection ?? n.data?.stepAltDirection) as
        | "up"
        | "down"
        | undefined,
    ]),
  );
  const canon = orientByBuildDirection(nodes, edges);

  return edges.map((e, i) => {
    if (tFlowOf(e)) return e;
    const ends = productTransformationEnds(e, typeOf);
    if (!ends) return e;
    const c = canon[i];
    if (c.source !== e.source) {
      return withTFlow(e, c.source === ends.product ? "in" : "out");
    }
    const productIsSource = ends.product === e.source;
    const tDir = dirOf.get(ends.transformation);
    const pDir = dirOf.get(ends.product);
    if (tDir === "up" && pDir && pDir !== tDir) {
      return withTFlow(e, productIsSource ? "out" : "in");
    }
    return withTFlow(e, productIsSource ? "in" : "out");
  });
}

/** Сырьё, стоящее на полотне выше преобразования, — или ниже? Зазор в 10 px
 *  гасит дрожание узлов одного ряда. */
const SAME_ROW = 10;

const HANDLE = {
  top: { source: "top-source", target: "top" },
  bottom: { source: "bottom", target: "bottom-target" },
} as const;

/**
 * Хэндлы связи «продукт ↔ преобразование» по смыслу: сырьё входит в верх
 * преобразования, продукт выходит из низа — где бы ни стоял узел. Сторону
 * продукта выбирает геометрия: ближняя к преобразованию.
 *
 * Если продукт стоит не на своей стороне (выход выше преобразования, сырьё
 * ниже), прямая линия прошла бы сквозь узел — такую связь рисуем в обход
 * (тип "loop", см. LoopEdge).
 */
export function semanticHandles(
  edge: Edge,
  flow: TFlow,
  source: CustomNode,
  target: CustomNode,
): Edge {
  const tIsSource = source.type === "transformation";
  const t = tIsSource ? source : target;
  const p = tIsSource ? target : source;
  const dy = (p.position?.y ?? 0) - (t.position?.y ?? 0);
  const productAbove = dy < 0;
  const tSide = flow === "in" ? "top" : "bottom";
  const pSide = productAbove ? "bottom" : "top";
  const tHandle = HANDLE[tSide][tIsSource ? "source" : "target"];
  const pHandle = HANDLE[pSide][tIsSource ? "target" : "source"];
  const backward = flow === "in" ? dy > SAME_ROW : dy < -SAME_ROW;
  const type = backward
    ? "loop"
    : edge.type === "loop"
      ? "straight"
      : (edge.type ?? "straight");
  return {
    ...edge,
    sourceHandle: tIsSource ? tHandle : pHandle,
    targetHandle: tIsSource ? pHandle : tHandle,
    type,
  };
}
