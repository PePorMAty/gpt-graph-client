// src/utils/separateComponentsHorizontally.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

const NODE_WIDTH = 220;

/**
 * Раздвигает НЕсвязные компоненты графа по горизонтали, чтобы они не накладывались
 * друг на друга. ELK во вкладке объединения раскладывается с
 * `separateConnectedComponents:false` (нужно якорному выравниванию слоёв), поэтому
 * два графа без общих продуктов могут лечь в одни координаты и перекрыться.
 *
 * Детерминированный пост-процесс: компоненты (по НЕнаправленным рёбрам)
 * упорядочиваем по текущему левому краю и упаковываем слева направо с зазором;
 * первая компонента остаётся на месте, остальные сдвигаются по X (Y не трогаем —
 * вертикальное выравнивание истоков уже сделал alignChainRoots).
 *
 * Один компонент (связный объединённый граф) — no-op. Идемпотентно: уже
 * упакованные компоненты дают сдвиг 0.
 */
export function separateComponentsHorizontally(
  nodes: CustomNode[],
  edges: Edge[],
  gap = 160,
): CustomNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  // Связные компоненты (BFS по ненаправленным рёбрам).
  const compOf = new Map<string, number>();
  const comps: string[][] = [];
  for (const n of nodes) {
    if (compOf.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    compOf.set(n.id, comps.length);
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      comp.push(id);
      for (const nb of adj.get(id) ?? []) {
        if (!compOf.has(nb)) {
          compOf.set(nb, comps.length);
          q.push(nb);
        }
      }
    }
    comps.push(comp);
  }
  if (comps.length <= 1) return nodes; // один компонент — раздвигать нечего

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const bbox = comps.map((comp) => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const id of comp) {
      const x = nodeById.get(id)!.position.x;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + NODE_WIDTH);
    }
    return { minX, maxX };
  });

  // Порядок слева направо по текущему левому краю; упаковываем без перекрытий.
  const order = comps.map((_, i) => i).sort((a, b) => bbox[a].minX - bbox[b].minX);
  const shiftByComp = new Map<number, number>();
  let cursor = bbox[order[0]].minX; // первый компонент остаётся на месте
  for (const ci of order) {
    const shift = cursor - bbox[ci].minX;
    shiftByComp.set(ci, shift);
    cursor = bbox[ci].maxX + shift + gap;
  }

  return nodes.map((n) => {
    const shift = shiftByComp.get(compOf.get(n.id)!) ?? 0;
    return shift
      ? { ...n, position: { x: n.position.x + shift, y: n.position.y } }
      : n;
  });
}
