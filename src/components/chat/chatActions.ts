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
export const CHAT_ADD = "chat-add";
export const CHAT_DELETE = "chat-delete";
export const CHAT_LAYOUT = "chat-layout";

/**
 * Событие с ответом: Flow слушает синхронно и пишет итог в detail —
 * dispatchEvent возвращается уже после обработчика.
 */
function ask<T extends object>(name: string, detail: T): T {
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return detail;
}

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

/** Окно «Определить коды» с этими продуктами; autoStart — подбор сразу (автопилот). */
export function requestCodes(ids: string[], autoStart = false): void {
  if (ids.length) window.dispatchEvent(new CustomEvent(CHAT_CODES, { detail: { ids, autoStart } }));
}

/** Переименовать узел — как правка названия в карточке. true — переименован. */
export function requestRename(nodeId: string, label: string): boolean {
  return ask(CHAT_RENAME, { nodeId, label, ok: false }).ok;
}

/** Объединить узел fromId с intoId — как «Объединить» в окне «Такой продукт уже есть». */
export function requestMerge(fromId: string, intoId: string): boolean {
  return ask(CHAT_MERGE, { fromId, intoId, ok: false }).ok;
}

/** Удалить узлы со связями — как подтверждённое удаление на полотне. true — удалены. */
export function requestDelete(ids: string[]): boolean {
  return ask(CHAT_DELETE, { ids, ok: false }).ok;
}

/** Разложить граф заново — как кнопка «Разложить». false — нельзя (фокус, пустой граф). */
export function requestLayout(): boolean {
  return ask(CHAT_LAYOUT, { ok: false }).ok;
}

/** Новый продукт на полотне — рядом с nearId или в середине экрана. id нового узла, null — не добавлен. */
export function requestAdd(label: string, nearId?: string): string | null {
  return ask(CHAT_ADD, { label, nearId, id: null as string | null }).id;
}
