// src/utils/collapseDuplicateTransformations.ts
//
// Схлопывание ДУБЛЕЙ ПРЕОБРАЗОВАНИЙ при объединении графов. mergeProductGraph
// схлопывает только продукты по нормализованному label; преобразования (включая
// alt-узлы) оставались дублями — при слиянии одинаковых графов узлы-шаги
// удваивались. Эта утилита зеркалит схлопывание продуктов для двух видов
// transformation-нод:
//
//  • alt-узел (вариант шага, data.chainVariant === "alt"): дубль = тот же
//    анкор-продукт (chainRootNodeId) + направление (stepAltDirection) + та же
//    «суть» (alternativeKey по входам/выходам из описания);
//  • обычное преобразование: дубль = то же имя (label) + тот же набор ВХОДНЫХ
//    product-узлов (+ направление построения, если есть). Выходы в ключ не
//    входят: «Нефть → Пиролиз → Этилен» и «Нефть → Пиролиз → Пропилен» — один
//    процесс «Пиролиз», его выходы объединяются. Имя в ключе ОБЯЗАТЕЛЬНО —
//    иначе два разных маршрута от того же продукта (А → {процесс X, процесс Y})
//    ошибочно слились бы в один. Направление разводит одноимённые up/down-шаги
//    от одного якоря (вверх — к прекурсорам, вниз — к продуктам). Без имени или
//    без входов — консервативный ключ по полному набору связей (вход + выход).
//
// Применять ПОСЛЕ схлопывания продуктов и ремапа chainRootNodeId — тогда альты и
// преобразования от ставшего общим продукта корректно сгруппируются.

import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import { alternativeKey } from "./parseAlternatives";
import { normalizeProductName } from "./normalizeProductName";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function collapseDuplicateTransformations(
  nodes: CustomNode[],
  edges: Edge[],
): { nodes: CustomNode[]; edges: Edge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Связность обычных преобразований: входные/выходные product-узлы.
  const inProds = new Map<string, Set<string>>();
  const outProds = new Map<string, Set<string>>();
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (s?.type === "product" && t?.type === "transformation") {
      (inProds.get(e.target) ?? inProds.set(e.target, new Set()).get(e.target)!).add(
        e.source,
      );
    } else if (s?.type === "transformation" && t?.type === "product") {
      (
        outProds.get(e.source) ?? outProds.set(e.source, new Set()).get(e.source)!
      ).add(e.target);
    }
  }

  const idRemap: Record<string, string> = {};
  const dropped = new Set<string>();
  const kept = new Map<string, string>();

  for (const n of nodes) {
    if (n.type !== "transformation") continue;
    let key: string;
    if (n.data?.chainVariant === "alt") {
      const root = str(n.data?.chainRootNodeId);
      if (!root) continue; // без анкора группировать нельзя
      const content = alternativeKey({
        fullDescription: str(n.data?.description),
        title: str(n.data?.label),
      });
      if (!content) continue; // суть не определена — не рискуем
      key = `alt::${root}::${str(n.data?.stepAltDirection)}::${content}`;
    } else {
      const name = normalizeProductName(str(n.data?.label));
      const dir = str(n.data?.chainDirection);
      const ins = [...(inProds.get(n.id) ?? [])].sort().join("|");
      const outs = [...(outProds.get(n.id) ?? [])].sort().join("|");
      if (!name && !ins && !outs) continue; // нечем отличать
      // Правило «имя + входные продукты»: одноимённые процессы от одного
      // набора входов — один узел, выходы объединяются. Фолбэк — старый
      // консервативный ключ по полному набору связей.
      key =
        name && ins
          ? `tr::${name}::dir:${dir}::in:${ins}`
          : `tr::${name}::in:${ins}::out:${outs}`;
    }
    const prev = kept.get(key);
    if (prev) {
      idRemap[n.id] = prev;
      dropped.add(n.id);
    } else {
      kept.set(key, n.id);
    }
  }

  if (dropped.size === 0) return { nodes, edges };

  const keptNodes = nodes.filter((n) => !dropped.has(n.id));

  // Ремап рёбер на оставшийся узел + дедуп по паре source->target (рёбра,
  // ведущие к дублю, после ремапа совпадут с рёбрами оставшегося узла).
  const seenPair = new Set<string>();
  const keptEdges: Edge[] = [];
  for (const e of edges) {
    const source = idRemap[e.source] ?? e.source;
    const target = idRemap[e.target] ?? e.target;
    if (source === target) continue;
    const pair = `${source}->${target}`;
    if (seenPair.has(pair)) continue;
    seenPair.add(pair);
    keptEdges.push(
      source === e.source && target === e.target ? e : { ...e, source, target },
    );
  }

  return { nodes: keptNodes, edges: keptEdges };
}
