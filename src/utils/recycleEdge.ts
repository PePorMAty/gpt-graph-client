// src/utils/recycleEdge.ts
//
// Связь «обратная переработка» (рециклинг): шаг получил продукт, который уже
// стоит в цепочке выше, — поликарбонат гидролизуют обратно в бисфенол А, из
// которого его и сделали. Химически это настоящий процесс, и на полотне он
// виден: преобразование с сырьём и пунктирная связь назад к предку
// (edge.data.recycle, см. stepToFlow).
//
// Такая связь замыкает круг, а граф строится как цепочка «от сырья к
// продуктам». Поэтому там, где нужна цепочка построения — родословная и
// проверка петель, раскладка, подсветка цепочки, её длина, — связи
// рециклинга не учитываются. Цепочка от неё дальше не строится: продукт на
// её конце уже стоит выше.

import type { Edge } from "@xyflow/react";

export function isRecycleEdge(edge: Edge): boolean {
  return (edge.data as { recycle?: unknown } | undefined)?.recycle === true;
}

/** Связи без рециклинга — цепочка построения, без кругов. */
export function withoutRecycle<E extends Edge>(edges: E[]): E[] {
  return edges.some(isRecycleEdge)
    ? edges.filter((e) => !isRecycleEdge(e))
    : edges;
}

/**
 * С какого конца рисовать стрелку связи рециклинга: туда, куда идёт вещество.
 * Иначе по пунктиру не понять, нижнее преобразование даёт верхний продукт или
 * верхний продукт идёт в нижнее преобразование.
 *
 * Связь «продукт ↔ преобразование» несёт смысл (data.tFlow): выход — вещество
 * идёт из преобразования в продукт, вход — наоборот. Склеенная связь режима
 * «Только продукты» смысла не несёт — у неё конец задан при склейке
 * (data.recycleArrow).
 */
export function recycleArrowAt(
  edge: Edge,
  typeOf: (id: string) => string | undefined,
): "start" | "end" {
  const data = edge.data as
    | { recycleArrow?: unknown; tFlow?: unknown }
    | undefined;
  if (data?.recycleArrow === "start" || data?.recycleArrow === "end") {
    return data.recycleArrow;
  }
  const trIsSource = typeOf(edge.source) === "transformation";
  const towardsTarget = data?.tFlow === "in" ? !trIsSource : trIsSource;
  return towardsTarget ? "end" : "start";
}
