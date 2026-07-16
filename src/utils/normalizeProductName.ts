// src/utils/normalizeProductName.ts

// Должно совпадать с normalizeLabel из mergeProductGraph.ts, иначе при
// сборке шага step-by-step v2 найдёт «совпадение» по другим правилам,
// чем merge — и появится визуальный дубликат после объединения графов.
const HYPHENS = /[-‐‑‒–—―−­]/g;
const APOSTROPHES = /[’ʼʹ´`]/g;
// eslint-disable-next-line no-irregular-whitespace, no-misleading-character-class -- класс намеренно содержит zero-width символы (ZWSP/ZWNJ/ZWJ/BOM)
const ZERO_WIDTH = /[​‌‍﻿]/g;
const NBSP = / /g;

export function normalizeProductName(name: string): string {
  return name
    .normalize("NFC")
    .replace(HYPHENS, " ")
    .replace(APOSTROPHES, "'")
    .replace(ZERO_WIDTH, "")
    .replace(NBSP, " ")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Find an existing product node whose label fuzzy-matches `productName`.
 * Returns the node id or null.
 */
export function findExistingProductNode(
  productName: string,
  nodes: ReadonlyArray<{
    id: string;
    type?: string;
    data: { label: string };
  }>,
): string | null {
  const normalized = normalizeProductName(productName);
  for (const node of nodes) {
    if (node.type !== "product") continue;
    if (normalizeProductName(node.data.label) === normalized) {
      return node.id;
    }
  }
  return null;
}
