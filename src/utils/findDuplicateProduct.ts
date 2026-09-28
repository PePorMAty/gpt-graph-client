// src/utils/findDuplicateProduct.ts
//
// Нет ли на полотне того же продукта под этим или другим названием.
//
// Продукт, созданный руками, до сих пор жил отдельно от одноимённого: два
// узла «Фенол» стояли рядом, у каждого свои источники, и ничто не говорило,
// что это одно и то же. А под другим названием («Кумол» при готовом
// «Изопропилбензоле») продукт не узнавался даже тогда, когда справочник
// давал обоим один идентификатор: слияние по идентификатору бывает только
// при сборке шага и при объединении графов, а не при переименовании узла.

import type { CustomNode } from "../types";
import { createProductIndex } from "./productIdentity";
import { resolveProductId } from "./resolveProductIds";

export interface DuplicateProduct {
  /** Узел, который уже есть на полотне. */
  nodeId: string;
  label: string;
  /**
   * Чем совпали: названием или веществом — справочник знает оба названия
   * как одно вещество («Кумол» и «Изопропилбензол»).
   */
  by: "name" | "substance";
}

/** Подписи-заготовки: по ним узел ещё не назван, и искать ему пару рано. */
const PLACEHOLDERS = new Set(["новый продукт", "продукт", "без названия"]);

/**
 * Найти на полотне другой узел того же продукта.
 *
 * Сперва по названию — это ответ сразу. Потом по справочнику: он знает
 * синонимы, но спрашивать его надо на сервере, поэтому функция асинхронная.
 * Справочник недоступен — остаёмся при сравнении названий.
 */
export async function findDuplicateProduct(
  nodeId: string,
  label: string,
  nodes: CustomNode[],
): Promise<DuplicateProduct | null> {
  const name = String(label ?? "").trim();
  if (!name || PLACEHOLDERS.has(name.toLowerCase())) return null;

  const others = nodes.filter((n) => n.type === "product" && n.id !== nodeId);
  if (!others.length) return null;
  const index = createProductIndex(others);
  const labelOf = (id: string) =>
    String(others.find((n) => n.id === id)?.data?.label ?? "");

  const byName = index.find({ label: name });
  if (byName) return { nodeId: byName, label: labelOf(byName), by: "name" };

  let canon: string | null = null;
  try {
    canon = await resolveProductId(name);
  } catch {
    return null;
  }
  if (!canon) return null;

  const bySubstance = index.find({
    label: name,
    productId: canon,
    productIdSource: "dictionary",
  });
  return bySubstance
    ? { nodeId: bySubstance, label: labelOf(bySubstance), by: "substance" }
    : null;
}
