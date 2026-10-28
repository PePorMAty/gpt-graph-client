// src/store/api/graph-extras-api.ts
//
// Закладки, история, расчёты материального баланса и идентификаторы
// продуктов сохранённого графа. На сервере это отдельные ресурсы рядом с
// файлом графа, а не часть его содержимого: закладку ставят на лету, расчёт
// приходит через минуты, идентификаторы проставляются сами при открытии, и
// они должны пережить перезагрузку вкладки, даже если сам граф ещё не
// сохраняли.
//
// Всё здесь работает только для графа, у которого есть id на сервере
// (savedGraphs.openedGraphId). Пока полотно не сохранено, закладки и история
// живут в памяти вкладки, как и раньше.

import axios from "axios";

import type {
  Bookmark,
  BookmarkKind,
  HistoryEntry,
  HistoryKind,
} from "../types";

const base = () => import.meta.env.VITE_API_URL;

/**
 * Какие записи истории уезжают на сервер.
 *
 * Серверная история графа — про изменения самого графа: шаги, узлы, связи,
 * правки, объединения, сохранения. «Граф открыт» и «Полотно очищено» описывают
 * сессию на полотне, а не правку файла, — от них список на сервере только
 * распухал бы при каждом открытии. Такие записи остаются в памяти вкладки.
 */
const SESSION_ONLY_KINDS: ReadonlySet<HistoryKind> = new Set(["open", "clear"]);

export function isSyncableEntry(entry: HistoryEntry): boolean {
  return !SESSION_ONLY_KINDS.has(entry.kind);
}

/* ========================= ЗАКЛАДКИ ========================= */

export async function fetchBookmarks(graphId: string): Promise<Bookmark[]> {
  const { data } = await axios.get(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/bookmarks`,
  );
  return Array.isArray(data?.data) ? data.data : [];
}

/** Создать или обновить закладку. Приходят только меняющиеся поля. */
export async function putBookmark(
  graphId: string,
  nodeId: string,
  patch: { label?: string; kind?: BookmarkKind; note?: string },
): Promise<void> {
  await axios.put(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/bookmarks/${encodeURIComponent(nodeId)}`,
    patch,
  );
}

export async function deleteBookmark(
  graphId: string,
  nodeId: string,
): Promise<void> {
  await axios.delete(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/bookmarks/${encodeURIComponent(nodeId)}`,
  );
}

/* ========================= ИСТОРИЯ ========================= */

export async function fetchHistory(graphId: string): Promise<HistoryEntry[]> {
  const { data } = await axios.get(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/history`,
  );
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Дописать записи пачкой. Порядок — от старых к свежим: сервер разворачивает
 * пачку сам и кладёт свежие в начало списка.
 */
export async function appendHistory(
  graphId: string,
  entries: HistoryEntry[],
): Promise<void> {
  if (!entries.length) return;
  await axios.post(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/history`,
    { entries },
  );
}

export async function clearHistoryOnServer(graphId: string): Promise<void> {
  await axios.delete(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/history`,
  );
}

/**
 * Отправить историю, не дожидаясь ответа, — для момента, когда вкладку
 * закрывают или прячут. Обычный запрос браузер в этот момент обрывает, а
 * sendBeacon доводит до конца уже после выгрузки страницы.
 *
 * Возвращает false, если beacon недоступен или отвергнут: тогда вызывающий
 * пробует обычный запрос.
 */
export function beaconHistory(
  graphId: string,
  entries: HistoryEntry[],
): boolean {
  if (!entries.length) return true;
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return false;

  try {
    const blob = new Blob([JSON.stringify({ entries })], {
      type: "application/json",
    });
    return navigator.sendBeacon(
      `${base()}/graph-files/${encodeURIComponent(graphId)}/history`,
      blob,
    );
  } catch {
    return false;
  }
}

/* ================== РАСЧЁТЫ МАТЕРИАЛЬНОГО БАЛАНСА ================== */

/**
 * Расчёты баланса по узлам преобразований: { id узла: список расчётов }.
 * Узел с пустым списком — расчёты с него убраны после сохранения графа.
 */
export async function fetchMaterialBalances(
  graphId: string,
): Promise<Record<string, unknown[]>> {
  const { data } = await axios.get(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/material-balances`,
  );
  const items = data?.data;
  return items && typeof items === "object" && !Array.isArray(items)
    ? items
    : {};
}

/** Записать список расчётов узла целиком. */
export async function putMaterialBalances(
  graphId: string,
  nodeId: string,
  calcs: unknown[],
): Promise<void> {
  await axios.put(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/material-balances/${encodeURIComponent(nodeId)}`,
    { calcs },
  );
}

/* ================= ИДЕНТИФИКАТОРЫ ПРОДУКТОВ ================= */

/**
 * Идентификатор продукта, записанный рядом с графом: что проставил
 * справочник, какой его версии и для какого названия узла. Без productId —
 * «справочник этой версии такого названия не знает».
 */
export interface StoredProductId {
  productId?: string;
  productIdSource?: "manual" | "tnved" | "cas" | "dictionary";
  productIdVersion?: string;
  productIdLabel?: string;
}

/**
 * Идентификаторы, проставленные после сохранения графа: без них при каждом
 * открытии справочник спрашивали обо всех продуктах заново. Старый сервер
 * ресурса не знает — пусто.
 */
export async function fetchProductIds(
  graphId: string,
): Promise<Record<string, StoredProductId>> {
  const { data } = await axios.get(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/product-ids`,
  );
  const items = data?.data;
  return items && typeof items === "object" && !Array.isArray(items)
    ? items
    : {};
}

/** Дописать идентификаторы узлов пачкой; null — убрать запись узла. */
export async function putProductIds(
  graphId: string,
  ids: Record<string, StoredProductId | null>,
): Promise<void> {
  await axios.put(
    `${base()}/graph-files/${encodeURIComponent(graphId)}/product-ids`,
    { ids },
  );
}
