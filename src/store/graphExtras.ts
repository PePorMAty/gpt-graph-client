// src/store/graphExtras.ts
//
// Закладки, история и расчёты баланса сохранённого графа: подтянуть при
// открытии, выгрузить при первом сохранении, очистить по кнопке.
//
// Обычные правки уходят на сервер сами — этим заведует graphExtrasMiddleware.
// Здесь только три момента, когда синхронизация не выводится из одного
// действия и её нужно запустить явно.

import { createAsyncThunk } from "@reduxjs/toolkit";

import type { AppDispatch, RootState } from "./store";
import type { HistoryEntry } from "./types";
import {
  appendHistory,
  clearHistoryOnServer,
  fetchBookmarks,
  fetchHistory,
  fetchMaterialBalances,
  isSyncableEntry,
  putBookmark,
} from "./api/graph-extras-api";
import { setBookmarks } from "./slices/bookmarksSlice";
import { restoreMaterialBalances } from "./slices/gptSlice";
import { pullReadyBalances } from "./slices/materialBalanceSlice";
import { clearHistory, restoreHistory } from "./slices/historySlice";
import { showToast } from "../components/toast/toastStore";

/**
 * Склеить записи, не допустив повторов по id.
 *
 * Слияние обязано быть идемпотентным: в режиме разработки React вызывает
 * эффекты дважды, и второй проход подаёт на вход уже склеенный список. Без
 * защиты запись, успевшая уехать на сервер и вернуться, оказалась бы в списке
 * дважды — с тем же id.
 */
function mergeById(...lists: HistoryEntry[][]): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];

  for (const list of lists) {
    for (const entry of list) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }

  return out;
}

/**
 * Открыт сохранённый граф — поднять его закладки, историю и расчёты
 * материального баланса с сервера. Расчёты — те, что изменились после
 * сохранения графа: пришли позже или их убрали (см. graphExtrasMiddleware).
 * Преобразованиям без расчёта — готовые из базы (pullReadyBalances).
 *
 * Зовётся сразу после loadGraphFromFile и setOpenedGraph. К этому моменту
 * локальные списки уже очищены под новый граф, а в истории лежит запись
 * «Граф открыт» — она про текущую сессию, на сервере её нет, поэтому кладём её
 * поверх серверных записей, а не вместо.
 *
 * Сервер может быть недоступен или ещё не знать про эти ресурсы — тогда просто
 * остаёмся с локальными списками, как было до появления хранилища.
 */
export const openGraphExtras = createAsyncThunk<
  void,
  string,
  { state: RootState }
>("graphExtras/open", async (graphId, { dispatch, getState }) => {
  const [bookmarks, history, balances] = await Promise.allSettled([
    fetchBookmarks(graphId),
    fetchHistory(graphId),
    fetchMaterialBalances(graphId),
  ]);

  // Пока ждали ответа, могли открыть другой граф — его узлы чужие расчёты
  // не получают.
  if (balances.status === "fulfilled") {
    if (getState().savedGraphs.openedGraphId === graphId) {
      dispatch(restoreMaterialBalances(balances.value));
    }
  } else {
    console.warn("Не удалось загрузить расчёты баланса графа", balances.reason);
  }
  // Расчёты графа на месте — для преобразований без расчёта спросить базу
  // сервера: готовое (в том числе с другого графа) приходит без «Рассчитать».
  if (getState().savedGraphs.openedGraphId === graphId) {
    void (dispatch as AppDispatch)(pullReadyBalances(graphId));
  }

  if (bookmarks.status === "fulfilled") {
    dispatch(setBookmarks(bookmarks.value));
  } else {
    console.warn("Не удалось загрузить закладки графа", bookmarks.reason);
  }

  if (history.status === "fulfilled") {
    const sessionEntries = getState().history.entries;
    dispatch(restoreHistory(mergeById(sessionEntries, history.value)));
  } else {
    console.warn("Не удалось загрузить историю графа", history.reason);
  }
});

/**
 * Полотно впервые сохранено как файл — перенести на сервер то, что накопилось
 * до появления id: закладки и историю построения графа.
 *
 * Зовётся до того, как сохранение допишет собственную запись «Граф сохранён», —
 * иначе она ушла бы на сервер дважды: и здесь, и обычной очередью middleware.
 *
 * Никогда не падает: сохранение графа не должно считаться неудачным из-за того,
 * что не доехали закладки.
 */
export const pushGraphExtras = createAsyncThunk<
  void,
  string,
  { state: RootState }
>("graphExtras/push", async (graphId, { getState }) => {
  const { bookmarks, history } = getState();

  await Promise.allSettled(
    bookmarks.items.map((b) =>
      putBookmark(graphId, b.nodeId, {
        label: b.label,
        kind: b.kind,
        note: b.note,
      }),
    ),
  );

  // В сторе свежие записи первыми, а пачка на сервер идёт от старых к свежим.
  const entries = history.entries.filter(isSyncableEntry).slice().reverse();

  try {
    await appendHistory(graphId, entries);
  } catch (e) {
    console.warn("Не удалось перенести историю графа на сервер", e);
  }
});

/**
 * Кнопка «Очистить историю»: убрать записи и локально, и на сервере.
 *
 * Отдельным действием, а не реакцией на clearHistory: тот же clearHistory
 * дёргается при каждой смене графа, и удалять по нему историю на сервере
 * значило бы терять её при простом открытии другого графа.
 */
export const clearHistoryEverywhere = createAsyncThunk<
  void,
  void,
  { state: RootState }
>("graphExtras/clearHistory", async (_, { dispatch, getState }) => {
  const graphId = getState().savedGraphs.openedGraphId;
  dispatch(clearHistory());

  if (!graphId) return;

  try {
    await clearHistoryOnServer(graphId);
  } catch (e) {
    console.warn("Не удалось очистить историю графа на сервере", e);
    showToast("error", "История очищена только в этой вкладке");
  }
});
