// Предложения чата → полотно: «Построить шаг» и «Показать на графе».
//
// Чат живёт рядом с полотном, а узлы, карточка и мастер шага — внутри Flow и
// карточки узла. Связь — событиями окна (как «highlight-node» у поиска):
// чат не держит ссылок на полотно и не перерисовывает его.
//
// Шаг: Flow выбирает узел и открывает карточку, карточка — мастер шага в
// нужном направлении. Карточка может открыться уже после события (сменился
// узел), поэтому просьба лежит здесь, пока её не заберёт карточка этого узла.

import { rememberBuildDirection } from "../flow-panel/buildDirection";

export const CHAT_OPEN_STEP = "chat-open-step";
export const CHAT_SHOW_NODES = "chat-show-nodes";

let pendingStep: { nodeId: string; direction: "up" | "down" } | null = null;

/** Открыть мастер шага у узла nodeId (название — label) в направлении direction. */
export function requestStep(nodeId: string, label: string, direction: "up" | "down"): void {
  pendingStep = { nodeId, direction };
  // Мастер начинает с направления, выбранного для продукта последним.
  rememberBuildDirection(label, direction);
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_STEP, { detail: { nodeId } }));
}

/** Карточка узла забирает просьбу открыть мастер, если она — для неё. */
export function takePendingStep(nodeId: string): { direction: "up" | "down" } | null {
  if (pendingStep?.nodeId !== nodeId) return null;
  const p = pendingStep;
  pendingStep = null;
  return { direction: p.direction };
}

/** Показать узлы на полотне: камера к ним, первый подсвечен. */
export function showNodes(ids: string[]): void {
  if (ids.length) window.dispatchEvent(new CustomEvent(CHAT_SHOW_NODES, { detail: { ids } }));
}
