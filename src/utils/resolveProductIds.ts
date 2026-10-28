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
// справочника же — когда справочник сменил версию. Заданный человеком или
// взятый из другого источника трогать нельзя — он может быть точнее.

import { identifyProducts } from "../store/api/industry-api";
import type { CustomNode } from "../types";
import {
  normalizeProductId,
  readProductId,
  readProductIdSource,
} from "./productIdentity";

/**
 * Версия справочника на сервере. undefined — ещё не узнавали в этом сеансе;
 * null — сервер её не сообщает (старый сервер): тогда об узлах с
 * идентификатором справочник не спрашиваем вовсе.
 */
let dictVersion: string | null | undefined;

/**
 * Стоит ли спросить справочник об этом узле.
 *
 * Узел, которого справочник этой версии уже видел (productIdVersion — текущая
 * версия), — нет: ответ был бы тем же. Это и узлы с идентификатором из
 * справочника, и узлы без него — справочник их не знает (на графе «ГК Титан»
 * таких 152 из 279). Раньше обо всех спрашивали при каждом открытии графа.
 *
 * Сменилась версия — спросить снова: идентификатор из справочника — не
 * данные узла, а запомненный его ответ. Когда «Известняк» и «Карбонат
 * кальция» развели по разным записям, узел «Карбонат кальция», сохранённый
 * раньше, так и носил бы «Известняк» — и при объединении не сошёлся бы с
 * новым узлом.
 *
 * Версии сервер не сообщает (старый сервер) — как раньше: без идентификатора
 * спрашиваем всегда, с идентификатором из справочника — уже не сверяем.
 * Заданный человеком и взятый из CAS или ТН ВЭД — не трогаем.
 */
function refreshable(data: CustomNode["data"] | undefined): boolean {
  const checked =
    typeof dictVersion === "string" && data?.productIdVersion === dictVersion;
  if (!readProductId(data)) return !checked;
  if (readProductIdSource(data) !== "dictionary") return false;
  return typeof dictVersion === "string" && !checked;
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
 * Спросить справочник о названиях, которых ещё не спрашивали. Пустой список —
 * только узнать версию справочника (если ещё не знаем).
 *
 * Сервер недоступен — не беда: возвращаем что есть. Объединение графов и
 * сборка шага должны работать и без справочника, просто схлопывая по
 * названиям, как до него.
 */
async function ask(names: string[]): Promise<void> {
  const pending = names.filter((n) => !answers.has(n));
  if (!pending.length && dictVersion !== undefined) return;

  for (let i = 0; i < Math.max(pending.length, 1); i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    try {
      const data = await identifyProducts(chunk);
      dictVersion = typeof data?.version === "string" ? data.version : null;
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

/** Подпись продукта без пробелов по краям; не продукт — пусто. */
const productLabel = (n: CustomNode) =>
  n.type === "product" && typeof n.data?.label === "string"
    ? n.data.label.trim()
    : "";

/**
 * Проставить идентификаторы продуктам — и сверить взятые из справочника
 * прежней версии.
 *
 * Возвращает новый список узлов — исходный не трогает. Если менять нечего,
 * возвращает тот же массив: объединение графов сравнивает списки по ссылке, и
 * лишняя копия сбивала бы это сравнение.
 *
 * Справочник только ЗАМЕНЯЕТ свой прежний ответ, но не стирает его. Не знает
 * он теперь этого названия, лежит сервер или справочника на нём нет — узел
 * остаётся с тем, что было: пропавший из-за сбоя идентификатор развёл бы
 * узлы, которые до сих пор сходились. Сверенный узел получает текущую версию
 * справочника — в следующий раз о нём не спросят.
 */
export async function resolveProductIds(
  nodes: CustomNode[],
): Promise<CustomNode[]> {
  if (!nodes.some(productLabel)) return nodes;
  // Версия справочника — до выбора, о ком спрашивать: от неё зависит, кто уже
  // сверен. Пустой запрос, раз за сеанс; не ответил — спросим обо всех, как
  // раньше.
  if (dictVersion === undefined) await ask([]);
  const need = [
    ...new Set(
      nodes
        .filter((n) => productLabel(n) && refreshable(n.data))
        .map(productLabel),
    ),
  ];
  if (!need.length) return nodes;
  await ask(need);

  const version = typeof dictVersion === "string" ? dictVersion : undefined;
  let changed = false;
  const next = nodes.map((n) => {
    const label = productLabel(n);
    if (!label || !refreshable(n.data)) return n;
    const id = answers.get(label);
    if (id === undefined) return n; // не дозвались — спросим в другой раз
    if (!id) {
      // Справочник этого названия не знает. Прежний его ответ, если был,
      // оставляем; отмечаем сверенным — иначе спрашивали бы каждый раз.
      if (!version) return n;
      changed = true;
      return { ...n, data: { ...n.data, productIdVersion: version } };
    }
    const current = readProductId(n.data);
    if (
      current &&
      normalizeProductId(current) === normalizeProductId(id) &&
      n.data?.productIdVersion === version
    ) {
      return n;
    }
    changed = true;
    return {
      ...n,
      data: {
        ...n.data,
        productId: id,
        productIdSource: "dictionary" as const,
        ...(version ? { productIdVersion: version } : {}),
      },
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
    byproducts?: { name: string; productId?: string }[];
  },
>(step: T): Promise<T> {
  if (!step) return step;

  const products = [
    ...(step.inputProducts ?? []),
    ...(step.outputProducts ?? []),
    ...(step.byproducts ?? []),
  ];
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
    ...(step.byproducts ? { byproducts: fill(step.byproducts) } : {}),
  };
}
