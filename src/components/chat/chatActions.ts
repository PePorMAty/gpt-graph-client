// Предложения чата → полотно: шаг, показ, коды, вкладка карточки,
// переименование и объединение узлов.
//
// Чат живёт рядом с полотном, а узлы, карточка и мастер шага — внутри Flow и
// карточки узла. Связь — событиями окна (как «highlight-node» у поиска):
// чат не держит ссылок на полотно и не перерисовывает его.
//
// Карточка узла: Flow выбирает узел и открывает карточку, а карточка — мастер
// шага в нужном направлении или нужную вкладку. Карточка может открыться уже
// после события (сменился узел), поэтому просьба лежит здесь, пока её не
// заберёт карточка этого узла.

import { rememberBuildDirection } from "../flow-panel/buildDirection";

export const CHAT_OPEN_CARD = "chat-open-card";
export const CHAT_SHOW_NODES = "chat-show-nodes";
export const CHAT_CODES = "chat-codes";
export const CHAT_RENAME = "chat-rename";
export const CHAT_MERGE = "chat-merge";

/** Что открыть в карточке узла: мастер шага или вкладку. */
export type CardRequest =
  | { kind: "step"; direction: "up" | "down" }
  | { kind: "tab"; tab: "tech" | "balance" };

let pending: { nodeId: string; request: CardRequest } | null = null;

function openCard(nodeId: string, request: CardRequest) {
  pending = { nodeId, request };
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_CARD, { detail: { nodeId } }));
}

/** Открыть мастер шага у узла nodeId (название — label) в направлении direction. */
export function requestStep(nodeId: string, label: string, direction: "up" | "down"): void {
  // Мастер начинает с направления, выбранного для продукта последним.
  rememberBuildDirection(label, direction);
  openCard(nodeId, { kind: "step", direction });
}

/** Открыть карточку узла на вкладке «Технологическое описание» или «Материальный баланс». */
export function requestCardTab(nodeId: string, tab: "tech" | "balance"): void {
  openCard(nodeId, { kind: "tab", tab });
}

/** Карточка узла забирает просьбу, если она — для неё. */
export function takePendingCard(nodeId: string): CardRequest | null {
  if (pending?.nodeId !== nodeId) return null;
  const { request } = pending;
  pending = null;
  return request;
}

/** Показать узлы на полотне: камера к ним, первый подсвечен. */
export function showNodes(ids: string[]): void {
  if (ids.length) window.dispatchEvent(new CustomEvent(CHAT_SHOW_NODES, { detail: { ids } }));
}

/** Окно «Определить коды» с этими продуктами. */
export function requestCodes(ids: string[]): void {
  if (ids.length) window.dispatchEvent(new CustomEvent(CHAT_CODES, { detail: { ids } }));
}

/** Переименовать узел — как правка названия в карточке. */
export function requestRename(nodeId: string, label: string): void {
  window.dispatchEvent(new CustomEvent(CHAT_RENAME, { detail: { nodeId, label } }));
}

/** Объединить узел fromId с intoId — как «Объединить» в окне «Такой продукт уже есть». */
export function requestMerge(fromId: string, intoId: string): void {
  window.dispatchEvent(new CustomEvent(CHAT_MERGE, { detail: { fromId, intoId } }));
}
