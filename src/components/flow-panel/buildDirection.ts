// Направление мастера шага по продукту.
//
// Последнее выбранное живёт вне компонента: мастер размонтируется вместе с
// окном, а вернуться человек хочет туда, откуда ушёл. Отдельный модуль — его
// пишет и чат с ИИ («Построить шаг вниз от «Фенол»»), не завися от панели.

import type { BuildDirection } from "../../store/types";

const last = new Map<string, BuildDirection>();
/** Направление, с которого мастер обязан открыться один раз (просьба чата). */
const forced = new Map<string, BuildDirection>();

export function lastBuildDirection(productName: string): BuildDirection | null {
  return last.get(productName) ?? null;
}

export function setLastBuildDirection(productName: string, direction: BuildDirection): void {
  last.set(productName, direction);
}

/**
 * Чат просит открыть мастер в этом направлении: при следующем открытии
 * мастер начнёт с него, даже если в другом продвинулись дальше.
 */
export function rememberBuildDirection(productName: string, direction: BuildDirection): void {
  last.set(productName, direction);
  forced.set(productName, direction);
}

export function takeForcedBuildDirection(productName: string): BuildDirection | null {
  const d = forced.get(productName) ?? null;
  forced.delete(productName);
  return d;
}
