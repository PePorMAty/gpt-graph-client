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

/**
 * Латинские буквы, неотличимые на вид от кириллических.
 *
 * «Бисфенол A» с латинской A и «Бисфенол А» с кириллической — на экране одна
 * и та же подпись, а для программы разные строки, и такие узлы не сходятся
 * никогда. Поймать это глазами нельзя: символы выглядят одинаково. Приводим
 * латинские к кириллическим — какая сторона победит, неважно, важно что
 * одинаково у всех сравниваемых.
 */
const LOOKALIKES: Record<string, string> = {
  a: "а", c: "с", e: "е", k: "к", o: "о", p: "р", x: "х", y: "у",
  b: "в", h: "н", m: "м", t: "т",
};
const LOOKALIKE_RE = /[acekopxybhmt]/g;

/**
 * Свести двойников — но только в строке, где есть кириллица.
 *
 * Решаем по строке целиком: в «Бисфенол A» подменённая буква стоит отдельным
 * словом, и по слову её от настоящей латиницы не отличить. А строку без
 * кириллицы не трогаем вовсе — «naphtha», «AdBlue», «PET» латинские по
 * существу, и «Co» (кобальт) не должен превращаться в «СО» (угарный газ).
 *
 * То же правило на сервере, в foldLookalikes: справочник обязан отвечать
 * одинаково на оба написания.
 */
function foldLookalikes(lowercased: string): string {
  if (!/[а-я]/.test(lowercased)) return lowercased;
  return lowercased.replace(LOOKALIKE_RE, (ch) => LOOKALIKES[ch] ?? ch);
}

export function normalizeProductName(name: string): string {
  return foldLookalikes(
    name
      .normalize("NFC")
      .replace(HYPHENS, " ")
      .replace(APOSTROPHES, "'")
      .replace(ZERO_WIDTH, "")
      .replace(NBSP, " ")
      .replace(/ё/g, "е")
      .replace(/Ё/g, "Е")
      .trim()
      .toLowerCase(),
  ).replace(/\s+/g, " ");
}
