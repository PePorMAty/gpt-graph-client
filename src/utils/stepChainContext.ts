// src/utils/stepChainContext.ts
//
// «Существующая цепочка» для обобщения шага (/step/aggregate, EXISTING_CHAIN):
// как раскрываемый продукт попал в граф и что от него уже построено в
// направлении шага.
//
// Раньше сюда шло описание узла (downDescription / description) — текст о
// продукте, а не цепочка. Модель принимала его за цепочку: называла
// раскрываемый продукт его описанием («Промежуточный продукт органического
// синтеза…» вместо «Дифенилкарбонат») и выбирала шаг по описанию, а не по
// источникам.

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { BuildDirection } from "../store/types";
import { transformationIO } from "./collapseDuplicateTransformations";
import { orientByProduction } from "./edgeFlow";

/** Сколько шагов родословной перечислять — дальние предки модели не нужны. */
const MAX_LINEAGE_STEPS = 12;

const labelOf = (n?: CustomNode) => String(n?.data?.label ?? "").trim();

/** Построенное преобразование: заготовки альтернатив — ещё не шаги. */
const isBuiltTransformation = (n?: CustomNode) =>
  n?.type === "transformation" && n.data?.chainVariant !== "alt";

/**
 * Текст цепочки вокруг продукта `anchorId` для шага в направлении `direction`.
 * Пустая строка — продукт стоит на полотне один, цепочки нет.
 */
export function buildStepChainContext(
  anchorId: string,
  nodes: CustomNode[],
  edges: Edge[],
  direction: BuildDirection,
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const anchorLabel = labelOf(byId.get(anchorId));
  if (!anchorLabel) return "";

  // Входы и выходы преобразований — по смыслу связей (tFlow), то есть по ходу
  // производства, как бы шаг ни строился.
  const io = transformationIO(nodes, edges);
  const names = (ids: Set<string>) =>
    [...ids]
      .map((id) => labelOf(byId.get(id)))
      .filter(Boolean)
      .map((s) => `«${s}»`)
      .join(" + ") || "?";
  const line = (trId: string) => {
    const cur = io.get(trId);
    if (!cur) return null;
    return `- ${names(cur.ins)} → [${labelOf(byId.get(trId)) || "преобразование"}] → ${names(cur.outs)}`;
  };

  // Как якорь попал в цепочку — по ходу производства, а не по рёбрам
  // построения: шаг «вверх» хранит связи от якоря к сырью, и предки,
  // найденные им, по рёбрам построения не видны. Для шага «вниз» это то, из
  // чего якорь получен (и так далее вверх), для шага «вверх» — то, что из
  // него делают (и дальше вниз).
  const back = new Map<string, string[]>();
  for (const e of orientByProduction(nodes, edges)) {
    const [from, to] = direction === "up" ? [e.source, e.target] : [e.target, e.source];
    const arr = back.get(from);
    if (arr) arr.push(to);
    else back.set(from, [to]);
  }
  const lineage: string[] = [];
  const visited = new Set<string>([anchorId]);
  const queue = [anchorId];
  while (queue.length && lineage.length < MAX_LINEAGE_STEPS) {
    const cur = queue.shift() as string;
    for (const p of back.get(cur) ?? []) {
      if (visited.has(p)) continue;
      visited.add(p);
      queue.push(p);
      if (isBuiltTransformation(byId.get(p))) lineage.push(p);
    }
  }

  // Уже построенное от якоря в направлении шага: «вниз» — преобразования, где
  // якорь сырьё, «вверх» — где он продукт.
  const built = [...io.entries()]
    .filter(([trId, cur]) =>
      isBuiltTransformation(byId.get(trId)) &&
      (direction === "up" ? cur.outs.has(anchorId) : cur.ins.has(anchorId)),
    )
    .map(([trId]) => trId)
    .filter((trId) => !lineage.includes(trId));

  const parts: string[] = [];
  // Ближние предки найдены первыми; читать цепочку удобнее от начала.
  const lineageLines = lineage
    .reverse()
    .map(line)
    .filter((s): s is string => !!s);
  if (lineageLines.length) {
    parts.push(
      `Как «${anchorLabel}» попал в цепочку (уже построенные шаги):\n${lineageLines.join("\n")}`,
    );
  }
  const builtLines = built.map(line).filter((s): s is string => !!s);
  if (builtLines.length) {
    parts.push(
      `Уже построено от «${anchorLabel}» ${direction === "up" ? "вверх" : "вниз"}:\n${builtLines.join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
