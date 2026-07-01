// src/utils/markChainRoots.ts
import type { CustomNode } from "../types";

/**
 * Помечает истинный «начальный продукт» цепочки флагом `data.chainBuiltRoot = true`
 * — ДО namespacing, пока `node.id` ещё оригинальные.
 *
 * Начальный продукт (исток построения) — это product-узел, чей СОБСТВЕННЫЙ
 * `data.chainRootNodeId` отсутствует ИЛИ указывает на самого себя. Под-якоря
 * под-цепочек (Бензол, Толуол, Пропилен, Пропан, сырой NGL …) в step-формате
 * хранят в `chainRootNodeId` id своего якоря — то есть указывают на ЧУЖОЙ узел,
 * — и поэтому корнями НЕ считаются. Это важно: иначе как «истоки» пометились бы
 * промежуточные продукты, и `alignChainRoots` потянул бы их на общий ряд.
 *
 * Зачем булев флаг и зачем до namespacing: `handleReplaceSource`/`handleMergeSource`
 * префиксят `node.id` (`r…__`/`m…__`), но НЕ `data.chainRootNodeId`, поэтому после
 * загрузки ссылка `chainRootNodeId` протухает. Самодостаточный булев флаг переживает
 * `...n`-спред namespacing — `alignChainRoots` найдёт истоки уже после раскладки.
 *
 * Если chain-метаданных нет (старый/презентационный формат без `chainRootNodeId`) —
 * флаг не ставится, корень для таких графов подберёт эвристика в `alignChainRoots`.
 */
export function markChainRoots(nodes: CustomNode[]): CustomNode[] {
  if (nodes.length === 0) return nodes;

  // Нет ни одного chainRootNodeId — формат без chain-метаданных, оставляем эвристике.
  const hasChainMeta = nodes.some((n) => Boolean(n.data?.chainRootNodeId));
  if (!hasChainMeta) return nodes;

  return nodes.map((n) => {
    if (n.data?.chainBuiltRoot === true) return n;
    if (n.type !== "product") return n;
    const r = n.data?.chainRootNodeId;
    // Якорь под-цепочки (ссылка на чужой узел) — это не начальный продукт.
    if (r && r !== n.id) return n;
    return { ...n, data: { ...n.data, chainBuiltRoot: true } };
  });
}
