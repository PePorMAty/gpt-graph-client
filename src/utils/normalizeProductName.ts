// src/utils/normalizeProductName.ts

// Приведение названия к сравнимому виду. Единственная копия этого правила:
// merge и сборка шага сравнивают продукты одним и тем же кодом (см.
// productIdentity.ts), иначе шаг находил бы «совпадение» по своим правилам и
// после объединения графов появлялся бы визуальный дубликат.
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
