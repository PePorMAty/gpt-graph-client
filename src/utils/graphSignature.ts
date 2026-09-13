import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

/**
 * Короткий слепок полотна — по нему строка состояния понимает, расходится ли
 * текущий граф с последним сохранением.
 *
 * Учитываем только то, что реально попадает в сейв и что видит пользователь:
 * состав узлов, их подписи, описания и позиции, состав связей. Позиции
 * округляем до целого — микросдвиги при перетаскивании не должны помечать
 * граф изменённым. Служебные поля (статусы запросов, бейджи, подсветка) в
 * слепок не входят: они меняются сами по себе и «грязным» граф не делают.
 */
export function graphSignature(nodes: CustomNode[], edges: Edge[]): string {
  const nodePart = nodes
    .map((n) => {
      const d = n.data ?? {};
      return [
        n.id,
        n.type ?? "",
        String(d.label ?? ""),
        String(d.description ?? "").length,
        Math.round(n.position?.x ?? 0),
        Math.round(n.position?.y ?? 0),
      ].join("~");
    })
    .sort()
    .join("|");

  const edgePart = edges
    .map((e) => `${e.source}>${e.target}`)
    .sort()
    .join("|");

  return `${nodes.length}/${edges.length}::${hash(nodePart)}::${hash(edgePart)}`;
}

/** Дешёвый строковый хеш (FNV-1a): слепок не должен расти вместе с графом. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
