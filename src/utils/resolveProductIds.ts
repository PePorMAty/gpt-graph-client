// src/utils/resolveProductIds.ts
//
// Проставить продуктам идентификаторы по справочнику синонимов.
//
// Идентификатор продукта — то, по чему узлы считаются одним и тем же. Пока его
// ставили только руками, толку от него было немного: никто не станет вписывать
// код каждому узлу графа на сотню веществ. Справочник на сервере знает ходовые
// названия и отвечает каноническим («ИПБ» → «Изопропилбензол») — его и
// записываем, после чего «ИПБ» и «Кумол» схлопываются сами.
//
// Проставляем тем, у кого идентификатора нет, и сверяем заново взятые из
// справочника же. Заданный человеком или взятый из другого источника трогать
// нельзя — он может быть точнее.

import { identifyProducts } from "../store/api/industry-api";
import type { CustomNode } from "../types";
import {
  normalizeProductId,
  readProductId,
  readProductIdSource,
} from "./productIdentity";

/**
 * Стоит ли спросить справочник об этом узле.
 *
 * Узел без идентификатора — ясно. Но и узел с идентификатором ИЗ СПРАВОЧНИКА
 * тоже: это не данные узла, а запомненный ответ справочника, а справочник
 * меняется. Когда «Известняк» и «Карбонат кальция» развели по разным записям,
 * узел «Карбонат кальция», сохранённый раньше, так и носил бы «Известняк» — и
 * при объединении не сошёлся бы с новым узлом «Карбонат кальция»: у обоих есть
 * идентификатор, они разные, а это запрет на слияние.
 *
 * Заданный человеком и взятый из CAS или ТН ВЭД — не трогаем.
 */
function refreshable(data: CustomNode["data"] | undefined): boolean {
  return !readProductId(data) || readProductIdSource(data) === "dictionary";
}

/**
 * Ответы справочника за сеанс.
 *
 * Справочник не меняется, пока работает сервер, а один и тот же продукт
 * приходит снова при каждом объединении — спрашивать его повторно незачем.
 * Ключ — название как есть: нормализацию делает сервер.
 */
const answers = new Map<string, string | null>();

/** Сколько названий отправляем за раз — столько же принимает сервер. */
const CHUNK = 500;

/**
 * Спросить справочник о названиях, которых ещё не спрашивали.
 *
 * Сервер недоступен — не беда: возвращаем что есть. Объединение графов и
 * сборка шага должны работать и без справочника, просто схлопывая по
 * названиям, как до него.
 */
async function ask(names: string[]): Promise<void> {
  const pending = names.filter((n) => !answers.has(n));
  if (!pending.length) return;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    try {
      const data = await identifyProducts(chunk);
      if (!data?.ready) {
        // Справочника на сервере нет — помечаем спрошенное как неизвестное,
        // чтобы не долбиться в него на каждое объединение.
        for (const name of chunk) answers.set(name, null);
        continue;
      }
      for (const name of chunk) {
        answers.set(name, data.results?.[name]?.id ?? null);
      }
    } catch {
      // Сеть или сервер молчат. Ничего не запоминаем: в следующий раз
      // справочник может быть доступен, и продукты получат идентификаторы.
      return;
    }
  }
}

/**
 * Проставить идентификаторы продуктам — и сверить взятые из справочника.
 *
 * Возвращает новый список узлов — исходный не трогает. Если менять нечего,
 * возвращает тот же массив: объединение графов сравнивает списки по ссылке, и
 * лишняя копия сбивала бы это сравнение.
 *
 * Справочник только ЗАМЕНЯЕТ свой прежний ответ, но не стирает его. Не знает
 * он теперь этого названия, лежит сервер или справочника на нём нет — узел
 * остаётся с тем, что было: пропавший из-за сбоя идентификатор развёл бы
 * узлы, которые до сих пор сходились.
 */
export async function resolveProductIds(
  nodes: CustomNode[],
): Promise<CustomNode[]> {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "product") continue;
    if (!refreshable(n.data)) continue;
    const label = typeof n.data?.label === "string" ? n.data.label.trim() : "";
    if (!label || seen.has(label)) continue;
    seen.add(label);
    names.push(label);
  }
  if (!names.length) return nodes;

  await ask(names);

  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== "product") return n;
    if (!refreshable(n.data)) return n;
    const label = typeof n.data?.label === "string" ? n.data.label.trim() : "";
    const id = label ? answers.get(label) : null;
    if (!id) return n;
    const current = readProductId(n.data);
    if (current && normalizeProductId(current) === normalizeProductId(id)) {
      return n;
    }
    changed = true;
    return {
      ...n,
      data: { ...n.data, productId: id, productIdSource: "dictionary" as const },
    };
  });

  return changed ? next : nodes;
}

/** Каноническое название для одного продукта, если справочник его знает. */
export async function resolveProductId(name: string): Promise<string | null> {
  const label = String(name ?? "").trim();
  if (!label) return null;
  await ask([label]);
  return answers.get(label) ?? null;
}

/**
 * Опознать продукты шага, пришедшего от модели.
 *
 * Модель отвечает названиями и про идентификаторы не знает — а на полотне тот
 * же продукт может стоять под другим названием. Без этого шаг с «Кумолом»
 * заводил бы второй узел рядом с «ИПБ». Спрашиваем справочник сразу, как шаг
 * пришёл: дальше он кладётся на полотно синхронно, и спросить будет уже негде.
 */
export async function identifyStepProducts<
  T extends {
    inputProducts: { name: string; productId?: string }[];
    outputProducts: { name: string; productId?: string }[];
  },
>(step: T): Promise<T> {
  if (!step) return step;

  const products = [...(step.inputProducts ?? []), ...(step.outputProducts ?? [])];
  const names = [
    ...new Set(
      products
        .filter((p) => !String(p?.productId ?? "").trim())
        .map((p) => String(p?.name ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (!names.length) return step;

  await ask(names);

  const fill = (list: { name: string; productId?: string }[]) =>
    list.map((p) => {
      if (String(p?.productId ?? "").trim()) return p;
      const id = answers.get(String(p?.name ?? "").trim());
      return id ? { ...p, productId: id } : p;
    });

  return {
    ...step,
    inputProducts: fill(step.inputProducts ?? []),
    outputProducts: fill(step.outputProducts ?? []),
  };
}
