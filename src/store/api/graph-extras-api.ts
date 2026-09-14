// src/store/api/graph-extras-api.ts
//
// Закладки и история сохранённого графа. На сервере это отдельные ресурсы рядом
// с файлом графа, а не часть его содержимого: закладку ставят на лету, и она
// должна пережить перезагрузку вкладки, даже если сам граф ещё не сохраняли.
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
