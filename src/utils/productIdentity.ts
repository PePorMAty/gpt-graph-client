// src/utils/productIdentity.ts
//
// Чем продукт равен продукту.
//
// До сих пор единственным признаком было название: «ИПБ», «Изопропилбензол» и
// «Кумол» оставались тремя узлами при объединении графов, хотя это одно
// вещество. Название для этого не годится — у вещества их несколько, и каждый
// автор графа пишет своё.
//
// Поэтому у продукта появился собственный идентификатор. Откуда взялось его
// значение — код ТН ВЭД, номер CAS или человек вписал руками — неважно: важно,
// что он один и тот же у одного вещества. Название остаётся запасным ключом,
// чтобы графы без идентификаторов схлопывались как раньше.

import { normalizeProductName } from "./normalizeProductName";

/** Откуда взялся идентификатор — показываем рядом со значением. */
export type ProductIdSource = "manual" | "tnved" | "cas" | "dictionary";

export const PRODUCT_ID_SOURCE_LABELS: Record<ProductIdSource, string> = {
  manual: "задан вручную",
  tnved: "код ТН ВЭД",
  cas: "номер CAS",
  dictionary: "из справочника",
};

interface NodeDataLike {
  label?: unknown;
  productId?: unknown;
  productIdSource?: unknown;
}

/** Идентификатор продукта, если он задан. Пустая строка — это «не задан». */
export function readProductId(data: NodeDataLike | undefined): string | null {
  const raw = data?.productId;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value || null;
}

export function readProductIdSource(
  data: NodeDataLike | undefined,
): ProductIdSource | null {
  const raw = data?.productIdSource;
  return raw === "manual" || raw === "tnved" || raw === "cas" || raw === "dictionary"
    ? raw
    : null;
}

/**
 * Приводим идентификатор к виду, в котором его сравнивают.
 *
 * «3901 10 0010» и «3901100010» — один код; регистр в CAS и в ручных пометках
 * тоже ничего не значит.
 */
export function normalizeProductId(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

interface ProductNodeLike {
  id: string;
  type?: string;
  data?: NodeDataLike;
}

/**
 * Можно ли сравнивать два идентификатора как значения одной системы.
 *
 * Каноническое название из справочника («Изопропилбензол») и номер CAS
 * («98-82-8») — разные системы: их несовпадение не значит, что вещества
 * разные. Раньше это считалось запретом на слияние, и узел, которому человек
 * вписал CAS, не сходился с продуктом шага, опознанным справочником, даже при
 * одинаковых названиях. Пара «справочник — CAS» сравнению не подлежит; все
 * остальные расхождения, как и прежде, запрещают слияние.
 */
function comparable(
  a: ProductIdSource | null,
  b: ProductIdSource | null,
): boolean {
  const pair = new Set([a, b]);
  return !(pair.has("dictionary") && pair.has("cas"));
}

/** Указатель «этот продукт у нас уже есть — вот он». */
export interface ProductIndex {
  /** id уже имеющегося узла того же продукта, либо null. */
  find(data: NodeDataLike | undefined): string | null;
  /** Учесть ещё один узел — следующие будут сравниваться и с ним. */
  add(nodeId: string, data: NodeDataLike | undefined): void;
}

/**
 * Когда два продукта — один и тот же.
 *
 * Правило одно, но у него две стороны:
 *
 * — Совпали идентификаторы — это одно вещество, как бы оно ни было подписано
 *   («ИПБ» и «Изопропилбензол» с одним CAS сливаются).
 * — Идентификатора нет хотя бы у одного — сравниваем названия, как и до его
 *   появления. Иначе проставленный код разводил бы по разным узлам то, что
 *   раньше сходилось по названию: у половины графов кодов нет и не будет.
 *
 * И единственный запрет: если обе стороны назвали свой идентификатор и они
 * разные — совпадение названий уже ничего не значит. Два разных «Масла» так и
 * остаются разными.
 */
export function createProductIndex(
  nodes: ReadonlyArray<ProductNodeLike> = [],
): ProductIndex {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  // Идентификатор уже учтённого узла — чтобы поймать расхождение кодов при
  // совпавших названиях.
  const idOfNode = new Map<string, string>();
  // И откуда он взялся: сравнивать можно только идентификаторы одной системы.
  const sourceOfNode = new Map<string, ProductIdSource | null>();

  const idKey = (data: NodeDataLike | undefined) => {
    const id = readProductId(data);
    return id ? normalizeProductId(id) : "";
  };
  const nameKey = (data: NodeDataLike | undefined) =>
    normalizeProductName(typeof data?.label === "string" ? data.label : "");

  /**
   * Идентификатор из справочника — это каноническое НАЗВАНИЕ вещества
   * («Изопропилбензол»), поэтому его можно сравнивать и с названиями узлов.
   * Так узел «ИПБ» с проставленным идентификатором узнаёт узел
   * «Изопропилбензол», которому идентификатор ещё не проставили, — а это
   * обычное дело: графы сохранялись до того, как справочник появился.
   *
   * Только для справочника: номер CAS с названием сравнивать нельзя, иначе
   * продукт, названный «98-82-8», сошёлся бы с продуктом, у которого это код.
   */
  const canonNameKey = (data: NodeDataLike | undefined) => {
    if (readProductIdSource(data) !== "dictionary") return "";
    const id = readProductId(data);
    return id ? normalizeProductName(id) : "";
  };

  const add: ProductIndex["add"] = (nodeId, data) => {
    const id = idKey(data);
    if (id) {
      idOfNode.set(nodeId, id);
      sourceOfNode.set(nodeId, readProductIdSource(data));
      if (!byId.has(id)) byId.set(id, nodeId);
    }
    const name = nameKey(data);
    // Первый победил: если на полотне уже два одноимённых узла, новый продукт
    // должен уехать к тому же, к какому уезжал раньше.
    if (name && !byName.has(name)) byName.set(name, nodeId);
    const canon = canonNameKey(data);
    if (canon && !byName.has(canon)) byName.set(canon, nodeId);
  };

  const find: ProductIndex["find"] = (data) => {
    const id = idKey(data);
    if (id) {
      const hit = byId.get(id);
      if (hit) return hit;
    }

    // Порядок важен: каноническое название сильнее собственной подписи узла.
    // «ИПБ» с каноном «Изопропилбензол» должен искать сперва изопропилбензол,
    // иначе на полотне с обоими названиями он уедет не к тому узлу.
    for (const name of [canonNameKey(data), nameKey(data)]) {
      if (!name) continue;
      const hit = byName.get(name);
      if (!hit) continue;
      const other = idOfNode.get(hit);
      if (
        id &&
        other &&
        other !== id &&
        comparable(readProductIdSource(data), sourceOfNode.get(hit) ?? null)
      ) {
        continue;
      }
      return hit;
    }
    return null;
  };

  for (const n of nodes) {
    if (n.type !== "product") continue;
    add(n.id, n.data);
  }

  return { find, add };
}

/**
 * Найти на полотне узел того же продукта.
 *
 * Разовый вопрос к списку узлов — для случаев, где индекс строить не из чего:
 * шаг приходит по одному продукту. Правило сравнения то же, что у
 * createProductIndex.
 */
export function findExistingProductNode(
  productName: string,
  nodes: ReadonlyArray<ProductNodeLike>,
  productId?: string | null,
  /**
   * Откуда идентификатор. Без него каноническое название из справочника не
   * сравнивалось с названиями узлов: шаг с «Кумолом» (опознан как
   * «Изопропилбензол») не находил на полотне узел «Изопропилбензол», если
   * тому идентификатор ещё не проставили, — и заводил второй узел.
   */
  productIdSource?: ProductIdSource | null,
): string | null {
  return createProductIndex(nodes).find({
    label: productName,
    productId: productId ?? undefined,
    productIdSource: productIdSource ?? undefined,
  });
}
