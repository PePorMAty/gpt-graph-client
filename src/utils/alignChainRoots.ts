// src/utils/alignChainRoots.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/**
 * Выравнивает «начальные продукты» (истоки цепочек) объединённого графа на один
 * горизонтальный ряд `targetY` — в том числе несколько истоков внутри ОДНОЙ связной
 * компоненты (когда графы слились в общий кластер через общие промежуточные продукты).
 *
 * Истоки компоненты:
 *  1) узлы с `data.chainBuiltRoot === true` (их проставляет `markChainRoots`);
 *  2) если ни одного — эвристика: product с in-degree 0 (исток построения; ничего в
 *     него не входит) и максимальным `y`; если таких нет — product с максимальным `y`.
 *
 * `targetY = max(y по всем истокам)` → истоки опускаются вниз на общий нижний ряд
 * (ориентация merge-вкладки — «сырьё сверху, продукты снизу»).
 *
 * Применение (гибрид, чтобы не плодить длинные рёбра там, где не нужно):
 *  - в каждой компоненте берём primary = исток с максимальным `y` и сдвигаем ВСЮ
 *    компоненту на `dy = targetY − primaryY` — её внутренняя раскладка сохраняется, а
 *    компонента с одним истоком (напр. отдельный граф) встаёт ровно, без длинных рёбер;
 *  - остальные истоки этой компоненты (когда их ≥2) доводим индивидуально на `targetY`
 *    — они отрываются вниз к общему ряду (их ребро до последнего метода удлиняется),
 *    т.к. свести несколько истоков разной глубины в ряд сдвигом всей компоненты нельзя.
 *
 * Идемпотентна: повторный вызов даёт тот же `targetY`, `dy` primary = 0, доводка — no-op.
 */
export function alignChainRoots(
  nodes: CustomNode[],
  edges: Edge[],
): CustomNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map((n) => n.id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Ненаправленная смежность + входящая степень (для эвристики истока).
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  // Связные компоненты (BFS по ненаправленным рёбрам).
  const compOf = new Map<string, number>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (compOf.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    compOf.set(n.id, components.length);
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      comp.push(id);
      for (const nb of adj.get(id) ?? []) {
        if (!compOf.has(nb)) {
          compOf.set(nb, components.length);
          q.push(nb);
        }
      }
    }
    components.push(comp);
  }

  const yOf = (id: string) => nodeById.get(id)!.position.y;
  const maxByY = (ids: string[]) =>
    ids.reduce((a, b) => (yOf(b) > yOf(a) ? b : a));

  // Истоки компоненты: помеченные флагом; иначе эвристика in-degree 0.
  const rootsOfComp = (comp: string[]): string[] => {
    const flagged = comp.filter(
      (id) => nodeById.get(id)!.data?.chainBuiltRoot === true,
    );
    if (flagged.length > 0) return flagged;
    const products = comp.filter((id) => nodeById.get(id)!.type === "product");
    if (products.length === 0) return [];
    const sources = products.filter((id) => (inDeg.get(id) ?? 0) === 0);
    return [maxByY(sources.length > 0 ? sources : products)];
  };

  // Истоки всех компонент + общий targetY.
  const compRoots: string[][] = components.map(rootsOfComp);
  const allRoots = compRoots.flat();
  if (allRoots.length === 0) return nodes; // ни одного истока — выравнивать нечего
  const targetY = allRoots.reduce((m, id) => Math.max(m, yOf(id)), -Infinity);

  // Сдвиг компоненты по primary + индивидуальная доводка остальных истоков.
  const dyByComp = new Map<number, number>();
  const snapToTarget = new Set<string>();
  components.forEach((comp, ci) => {
    const roots = compRoots[ci];
    if (roots.length === 0) return;
    const primary = maxByY(roots);
    dyByComp.set(ci, targetY - yOf(primary));
    for (const r of roots) {
      if (r !== primary) snapToTarget.add(r);
    }
  });

  return nodes.map((n) => {
    // Не-primary исток: доводим точно на общий ряд (отрыв от сдвига компоненты).
    if (snapToTarget.has(n.id)) {
      return { ...n, position: { x: n.position.x, y: targetY } };
    }
    const dy = dyByComp.get(compOf.get(n.id)!);
    if (!dy) return n; // компонента без истока, либо primary уже на targetY (dy=0)
    return { ...n, position: { x: n.position.x, y: n.position.y + dy } };
  });
}
