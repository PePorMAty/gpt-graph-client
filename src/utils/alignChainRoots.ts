// src/utils/alignChainRoots.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/**
 * Выравнивает «начальные продукты» (истоки цепочек) объединённого графа на один
 * горизонтальный уровень. Для каждой связной компоненты находит корень и сдвигает
 * ВСЮ компоненту по вертикали так, чтобы её корень встал на общий `targetY`.
 * Двигаем компоненту целиком → внутренняя раскладка цепочки сохраняется, а
 * межкомпонентных рёбер нет (компоненты максимальны), поэтому ни одно ребро не
 * растягивается через границу сдвига.
 *
 * Корень компоненты:
 *  1) узел с `data.chainBuiltRoot === true` (если несколько — с максимальным y);
 *  2) иначе эвристика: product-сток (нет исходящих рёбер) с максимальным y;
 *     если стоков нет — просто product-узел с максимальным y.
 *
 * `targetY = max(rootY по компонентам)` → истоки выстраиваются в одну линию, а
 * компоненты сдвигаются только вниз (dy ≥ 0). Компоненты без корня не трогаем.
 * Идемпотентна: повторный вызов на уже выровненном графе даёт тот же `targetY`.
 */
export function alignChainRoots(
  nodes: CustomNode[],
  edges: Edge[],
): CustomNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map((n) => n.id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Ненаправленная смежность + исходящая степень (для определения стоков).
  const adj = new Map<string, string[]>();
  const outDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    outDeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
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

  const pickRoot = (comp: string[]): string | null => {
    // 1) явный флаг истока
    const flagged = comp.filter(
      (id) => nodeById.get(id)!.data?.chainBuiltRoot === true,
    );
    if (flagged.length > 0) return maxByY(flagged);
    // 2) эвристика: product-сток с максимальным y (для графов без метаданных)
    const products = comp.filter((id) => nodeById.get(id)!.type === "product");
    if (products.length === 0) return null;
    const sinks = products.filter((id) => (outDeg.get(id) ?? 0) === 0);
    return maxByY(sinks.length > 0 ? sinks : products);
  };

  // Корень каждой компоненты + общий targetY.
  const rootByComp = new Map<number, string>();
  let targetY: number | null = null;
  components.forEach((comp, ci) => {
    const root = pickRoot(comp);
    if (!root) return;
    rootByComp.set(ci, root);
    const ry = yOf(root);
    if (targetY === null || ry > targetY) targetY = ry;
  });
  if (targetY === null) return nodes; // ни одного корня — выравнивать нечего
  const ty: number = targetY;

  // Сдвиг компоненты так, чтобы её корень оказался на ty.
  const dyByComp = new Map<number, number>();
  for (const [ci, root] of rootByComp) dyByComp.set(ci, ty - yOf(root));

  return nodes.map((n) => {
    const dy = dyByComp.get(compOf.get(n.id)!);
    if (!dy) return n; // компонента без корня, либо корень уже на ty (dy=0)
    return { ...n, position: { x: n.position.x, y: n.position.y + dy } };
  });
}
