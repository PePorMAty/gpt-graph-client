// src/utils/markChainRoots.ts
import type { CustomNode } from "../types";

/**
 * Помечает узлы-истоки цепочек флагом `data.chainBuiltRoot = true` — ДО namespacing,
 * пока `node.id` ещё оригинальные и совпадают с `chainRootNodeId`.
 *
 * Корень цепочки — узел, чей `id` фигурирует как чей-то `chainRootNodeId`
 * (у самого корня `id === chainRootNodeId`). Уже выставленный `chainBuiltRoot`
 * сохраняем как есть.
 *
 * Зачем до namespacing: `handleReplaceSource`/`handleMergeSource` префиксят `node.id`
 * (`r…__`/`m…__`), но НЕ `data.chainRootNodeId`, поэтому после загрузки ссылка
 * протухает и определить корень по `id === chainRootNodeId` уже нельзя. Булев флаг
 * самодостаточен (не ссылается на id) и переживает `...n`-спред namespacing —
 * `alignChainRoots` найдёт истоки уже после раскладки.
 *
 * Если chain-метаданных нет (старый/презентационный формат без `chainRootNodeId`) —
 * флаг не ставится, корень для таких графов подберёт эвристика в `alignChainRoots`.
 */
export function markChainRoots(nodes: CustomNode[]): CustomNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map((n) => n.id));
  const rootIds = new Set<string>();
  for (const n of nodes) {
    const r = n.data?.chainRootNodeId;
    if (r && idSet.has(r)) rootIds.add(r);
  }
  if (rootIds.size === 0) return nodes; // нет chain-метаданных — оставляем эвристике

  return nodes.map((n) => {
    if (n.data?.chainBuiltRoot === true) return n;
    if (!rootIds.has(n.id)) return n;
    return { ...n, data: { ...n.data, chainBuiltRoot: true } };
  });
}
