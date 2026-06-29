// src/utils/orientByBuildDirection.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

type Dir = "up" | "down";

/**
 * Идемпотентно приводит рёбра объединённого графа к канону «сырьё → продукт»
 * (по ходу производства, сверху вниз).
 *
 * Зачем именно идемпотентно: step-билдеры создают рёбра `якорь →
 * преобразование → новый-узел` для ОБОИХ направлений. У «вниз»-графа якорь —
 * начальный (входной) продукт, поэтому рёбра уже идут сырьё→продукт (канон). У
 * «вверх»-графа якорь — выходной продукт, а новые узлы — его предшественники,
 * поэтому рёбра топологически перевёрнуты (продукт→сырьё). Нужно привести всё к
 * одному канону.
 *
 * Ориентацию КАЖДОГО ребра вычисляем из СТАБИЛЬНОЙ структуры, не зависящей от
 * текущего направления рёбер: ненаправленное расстояние конца до корня цепочки
 * (флаг `data.chainBuiltRoot`) + направление сборки (`data.chainDirection`).
 * Поэтому повторное применение к уже-канональным рёбрам — no-op: функция
 * самовосстанавливается на любых входных рёбрах (нативных, ранее-развёрнутых, из
 * старых сохранений), что чинит переворот при повторном объединении.
 *
 * Корень цепочки (chainBuiltRoot) — НАЧАЛЬНЫЙ продукт, с которого начали строить,
 * в ОБОИХ направлениях (rootNodeId в stepToFlow). Для «вниз» он сам — вход
 * (dist=0), рёбра сырьё→продукт остаются как есть. Для «вверх» он сам — выход, а
 * сырьё (предшественники) дальше от корня → рёбра разворачиваются
 * предшественник→…→начальный продукт, и начальный продукт уходит вниз.
 *
 * ВАЖНО про корни: берём из флага `chainBuiltRoot` (его ставит markChainRoots), а
 * НЕ из `chainRootNodeId` — последний есть ссылка на id, которая протухает после
 * префиксации id в объединении/загрузке (`m…__`/`r…__`), из-за чего раньше функция
 * не находила корни и была полностью no-op (отсюда переворот «вверх»-графов).
 */
export function orientByBuildDirection(
  nodes: CustomNode[],
  edges: Edge[],
): Edge[] {
  if (edges.length === 0) return edges;

  const idSet = new Set(nodes.map((n) => n.id));
  const dirOf = new Map<string, Dir | undefined>();
  const rootOf = new Map<string, string | undefined>();
  for (const n of nodes) {
    // alt-ноды несут направление в stepAltDirection (chainDirection у них нет) —
    // иначе ребро к альтернативе не классифицируется и не разворачивается, и
    // альтернатива «вверх»-графа уезжает вниз.
    dirOf.set(
      n.id,
      (n.data?.chainDirection ?? n.data?.stepAltDirection) as Dir | undefined,
    );
    rootOf.set(n.id, n.data?.chainRootNodeId as string | undefined);
  }

  // Ненаправленная смежность (направление рёбер тут НЕ важно — оно и есть то,
  // что мы пересчитываем).
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  // Корни цепочек = «начальные продукты», помеченные markChainRoots флагом
  // data.chainBuiltRoot. Флаг переживает namespacing id (в отличие от
  // chainRootNodeId — ссылки на id, которая протухает после префиксации).
  const roots = new Set<string>();
  for (const n of nodes) {
    if (n.data?.chainBuiltRoot === true && idSet.has(n.id)) roots.add(n.id);
  }
  // Легаси-фолбэк: если флага нет (не-namespaced контекст) — по chainRootNodeId.
  if (roots.size === 0) {
    for (const n of nodes) {
      const r = rootOf.get(n.id);
      if (r && idSet.has(r)) roots.add(r);
    }
  }
  if (roots.size === 0) return edges; // нет step-цепочек — трогать нечего

  const bfsFrom = (root: string): Map<string, number> => {
    const d = new Map<string, number>([[root, 0]]);
    const q = [root];
    for (let i = 0; i < q.length; i++) {
      const cd = d.get(q[i])!;
      for (const nb of adj.get(q[i]) ?? []) {
        if (!d.has(nb)) {
          d.set(nb, cd + 1);
          q.push(nb);
        }
      }
    }
    return d;
  };
  const distByRoot = new Map<string, Map<string, number>>();
  for (const root of roots) distByRoot.set(root, bfsFrom(root));

  // Расстояние узла до СВОЕГО корня; иначе — до ближайшего корня (фолбэк для
  // редких стыковых узлов без собственного корня в составе компоненты).
  const distOf = (id: string): number | undefined => {
    const own = rootOf.get(id);
    if (own && distByRoot.get(own)?.has(id)) return distByRoot.get(own)!.get(id);
    let best: number | undefined;
    for (const dmap of distByRoot.values()) {
      const v = dmap.get(id);
      if (v != null && (best == null || v < best)) best = v;
    }
    return best;
  };

  return edges.map((e) => {
    const du = dirOf.get(e.source);
    const dv = dirOf.get(e.target);
    const touchesDown = du === "down" || dv === "down";
    const touchesUp = du === "up" || dv === "up";

    // Класс ребра. Стык up↔down и продуктовые графы (нет направления) не трогаем.
    let edgeDir: Dir | null = null;
    if (touchesDown && !touchesUp) edgeDir = "down";
    else if (touchesUp && !touchesDown) edgeDir = "up";
    if (edgeDir === null) return e;

    const distU = distOf(e.source);
    const distV = distOf(e.target);
    if (distU == null || distV == null || distU === distV) return e;

    // Корень (chainBuiltRoot) = начальный продукт, с которого начали строить,
    // dist=0, в обоих направлениях. Канон — сырьё→продукт (входы сверху), source
    // = вход:
    //  • down: начали со входа (он сам — сырьё) → source = БЛИЖЕ к корню (меньший
    //    dist); цепочка S→…→производное остаётся как есть;
    //  • up:   начали с выхода (он сам — продукт), сырьё — предшественники дальше
    //    от корня → source = ДАЛЬШЕ (больший dist); рёбра разворачиваются в
    //    предшественник→…→начальный продукт, и он уходит вниз.
    const sourceIsU = edgeDir === "down" ? distU < distV : distU > distV;
    const newSource = sourceIsU ? e.source : e.target;
    const newTarget = sourceIsU ? e.target : e.source;
    if (newSource === e.source && newTarget === e.target) return e;

    // Хэндлы перевыставит applyHandlesByGeometry после раскладки.
    return { ...e, source: newSource, target: newTarget };
  });
}
