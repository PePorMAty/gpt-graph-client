// src/utils/orientByBuildDirection.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/** Флаг на ребре: оно уже приведено к канону «сырьё → продукт». Лежит в
 *  edge.data, переживает mergeProductGraph (спред {...e}) и
 *  layoutMergedGraphElk (возвращает edges как есть). Защищает от повторного
 *  разворота при ре-merge («Добавить граф» поверх уже развёрнутого графа). */
export const ORIENTED_RAW_TO_PRODUCT = "orientedRawToProduct";

/**
 * Приводит рёбра объединённого графа к единому канону «сырьё → продукт»
 * (по ходу производства, сверху вниз), разворачивая части, построенные
 * «вниз».
 *
 * Зачем: step-билдеры всегда создают рёбра `якорь → преобразование →
 * новый-узел`, не переворачивая source/target по направлению. У графа,
 * построенного «вниз», якорь — конечный продукт, поэтому рёбра идут
 * продукт→сырьё, т.е. топологически перевёрнуты относительно «вверх»-графов
 * и продуктовых графов (сырьё→продукт). Из-за этого в объединении сырьё
 * оказывалось снизу. Разворачиваем «вниз»-цепочки → сырьё снова исток и
 * встаёт наверх; раскладка считает чистые слои по канонической ориентации.
 *
 * Направление части берём из `data.chainDirection` («up» | «down»), который
 * билдеры проставляют каждому step-узлу, а merge сохраняет.
 *
 * Идемпотентно: ребро с флагом ORIENTED_RAW_TO_PRODUCT не трогаем.
 */
export function orientByBuildDirection(
  nodes: CustomNode[],
  edges: Edge[],
): Edge[] {
  if (edges.length === 0) return edges;

  const dir = new Map<string, unknown>(
    nodes.map((n) => [n.id, n.data?.chainDirection]),
  );

  return edges.map((e) => {
    if ((e.data as Record<string, unknown> | undefined)?.[
      ORIENTED_RAW_TO_PRODUCT
    ] === true) {
      return e;
    }

    const sDir = dir.get(e.source);
    const tDir = dir.get(e.target);
    const touchesDown = sDir === "down" || tDir === "down";
    const touchesUp = sDir === "up" || tDir === "up";

    // Разворачиваем только рёбра «вниз»-цепочек. Guard !touchesUp бережёт
    // целостность up-подграфа на стыках общих (схлопнутых при merge) узлов.
    if (!touchesDown || touchesUp) return e;

    // Хэндлы тут не выставляем — их перевыставит applyHandlesByGeometry по
    // фактической геометрии уже после раскладки.
    return {
      ...e,
      source: e.target,
      target: e.source,
      data: { ...(e.data ?? {}), [ORIENTED_RAW_TO_PRODUCT]: true },
    };
  });
}
