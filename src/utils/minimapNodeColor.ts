import type { Node } from "@xyflow/react";

const PRODUCT = "#2196f3";
const TRANSFORM = "#ff9800";
const ALT = "#a855f7";

/**
 * Цвет узла на мини-карте: та же семантика, что и на полотне, —
 * продукт синий, преобразование оранжевое, альтернатива фиолетовая.
 *
 * У объединённых графов продукт несёт свой цвет презентации
 * (`presentationColor`) — на мини-карте показываем именно его, иначе
 * деревья разных источников сливаются в одно синее пятно.
 */
export function minimapNodeColor(node: Node): string {
  const data = node.data as Record<string, unknown> | undefined;
  if (data?.chainVariant === "alt") return ALT;
  if (node.type === "transformation") return TRANSFORM;
  const presentation = data?.presentationColor;
  return typeof presentation === "string" && presentation
    ? presentation
    : PRODUCT;
}
