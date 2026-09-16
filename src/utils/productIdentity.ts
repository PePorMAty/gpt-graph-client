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

  const idKey = (data: NodeDataLike | undefined) => {
    const id = readProductId(data);
    return id ? normalizeProductId(id) : "";
  };
  const nameKey = (data: NodeDataLike | undefined) =>
    normalizeProductName(typeof data?.label === "string" ? data.label : "");

  const add: ProductIndex["add"] = (nodeId, data) => {
    const id = idKey(data);
    if (id) {
      idOfNode.set(nodeId, id);
      if (!byId.has(id)) byId.set(id, nodeId);
    }
    const name = nameKey(data);
    // Первый победил: если на полотне уже два одноимённых узла, новый продукт
    // должен уехать к тому же, к какому уезжал раньше.
    if (name && !byName.has(name)) byName.set(name, nodeId);
  };

  const find: ProductIndex["find"] = (data) => {
    const id = idKey(data);
    if (id) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    const name = nameKey(data);
    if (!name) return null;
    const hit = byName.get(name);
    if (!hit) return null;
    const other = idOfNode.get(hit);
    if (id && other && other !== id) return null;
    return hit;
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
): string | null {
  return createProductIndex(nodes).find({
    label: productName,
    productId: productId ?? undefined,
  });
}
