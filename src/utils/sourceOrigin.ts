// src/utils/sourceOrigin.ts
//
// Откуда источник: PDF из локальной базы сервера, найденный моделью раньше и
// сохранённый в базе — или только что найденный поиском.

import type { TechnologySource } from "../store/types";
import { normalizeProductName } from "./normalizeProductName";

/**
 * У PDF из локальной базы адрес — путь относительно API сервера
 * («local-sources/documents/12/file#page=3»). По нему узнаём PDF и там, где
 * поля origin нет: в графе, сохранённом облегчённым, и в ссылках
 * преобразований, где от источника остался только адрес.
 */
export function isLocalSourceUrl(url: string): boolean {
  return String(url ?? "").trim().startsWith("local-sources/");
}

export function isLocalSource(s: Pick<TechnologySource, "url" | "origin">): boolean {
  return s.origin === "local" || isLocalSourceUrl(s.url);
}

/** Найден моделью раньше (в этом или другом графе) и взят из базы сервера. */
export function isSavedSource(s: Pick<TechnologySource, "savedAt">): boolean {
  return !!s.savedAt;
}

/**
 * Взят из базы сервера для ЭТОГО продукта: его PDF или найденное для него
 * раньше. Такие источники — его собственные, даже в списке, взятом у предка.
 */
export function isOwnBaseSource(
  s: Pick<TechnologySource, "url" | "origin" | "savedAt" | "baseFor">,
  productName: string,
): boolean {
  return (
    (isLocalSource(s) || isSavedSource(s)) &&
    !!s.baseFor &&
    s.baseFor === normalizeProductName(productName)
  );
}

/** Страница PDF из адреса (#page=N), если указана. */
export function localSourcePage(url: string): number | null {
  const m = /#page=(\d+)/.exec(String(url ?? ""));
  return m ? Number(m[1]) : null;
}

/** Короткая подпись PDF вместо домена: «PDF · стр. 3». */
export function localSourceLabel(url: string, page?: number | null): string {
  const p = page ?? localSourcePage(url);
  return p ? `PDF · стр. ${p}` : "PDF";
}

/**
 * Текст ссылки на источник: у PDF — «PDF · стр. N» вместо пути на сервере,
 * который человеку ничего не говорит; у веб-источника — сам адрес.
 */
export function sourceLinkText(url: string): string {
  return isLocalSourceUrl(url) ? localSourceLabel(url) : url;
}

/** PDF — первыми: у них приоритет и в списке, и в обобщении. */
export function localFirst<T extends Pick<TechnologySource, "url" | "origin">>(
  sources: T[],
): T[] {
  return [
    ...sources.filter((s) => isLocalSource(s)),
    ...sources.filter((s) => !isLocalSource(s)),
  ];
}
