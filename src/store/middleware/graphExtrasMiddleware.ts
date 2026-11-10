import type { Middleware } from "@reduxjs/toolkit";

import type { RootState } from "../store";
import type { HistoryEntry } from "../types";
import {
  appendHistory,
  beaconHistory,
  deleteBookmark,
  isSyncableEntry,
  putBookmark,
  putMaterialBalances,
  putProductIds,
  type StoredProductId,
} from "../api/graph-extras-api";
import { showToast } from "../../components/toast/toastStore";

/**
 * Пауза перед отправкой накопленных записей истории. Действия идут очередями
 * (принятый шаг — это сразу несколько записей), и отправлять каждую отдельным
 * запросом дорого; за это время очередь успевает собраться в одну пачку.
 */
const FLUSH_DELAY_MS = 1500;

/** Накопленные, но ещё не отправленные записи истории одного графа. */
let pending: { graphId: string; entries: HistoryEntry[] } | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cancelTimer() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

/** Отправить накопленное. Ошибку не показываем: история — фоновая запись. */
async function flushPending() {
  cancelTimer();
  const batch = pending;
  pending = null;
  if (!batch) return;

  try {
    await appendHistory(batch.graphId, batch.entries);
  } catch (e) {
    console.warn("Не удалось записать историю графа на сервер", e);
  }
}

function scheduleFlush() {
  cancelTimer();
  flushTimer = setTimeout(() => void flushPending(), FLUSH_DELAY_MS);
}

/**
 * Вкладку закрывают или прячут — досылаем то, что не успело уйти по таймеру.
 * Обычный запрос браузер в этот момент обрывает, поэтому идём через sendBeacon.
 */
function installUnloadFlush() {
  if (typeof document === "undefined") return;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    const batch = pending;
    if (!batch) return;

    cancelTimer();
    pending = null;
    if (!beaconHistory(batch.graphId, batch.entries)) {
      // Beacon не взял — пробуем обычным запросом: вкладку могли просто
      // свернуть, тогда он успеет пройти.
      void appendHistory(batch.graphId, batch.entries).catch(() => {});
    }
  });
}

installUnloadFlush();

/**
 * Расчёты баланса узлов, ждущие отправки: «граф::узел» → последний список.
 * Проценты правят прямо в таблице, правку за правкой, — на сервер уходит
 * последний список узла после короткой паузы.
 */
const BALANCES_DELAY_MS = 500;
const pendingBalances = new Map<
  string,
  { graphId: string; nodeId: string; calcs: unknown[] }
>();
let balancesTimer: ReturnType<typeof setTimeout> | null = null;

function flushBalances() {
  if (balancesTimer) clearTimeout(balancesTimer);
  balancesTimer = null;
  const batch = [...pendingBalances.values()];
  pendingBalances.clear();
  for (const { graphId, nodeId, calcs } of batch) {
    putMaterialBalances(graphId, nodeId, calcs).catch((e) => {
      console.warn("Не удалось сохранить расчёт баланса на сервере", e);
      showToast(
        "error",
        "Расчёт баланса не сохранился на сервере",
        "На полотне он есть, но при следующем открытии графа его может не быть. Следующая правка расчёта попробует записать снова.",
      );
    });
  }
}

function queueBalances(graphId: string, nodeId: string, calcs: unknown[]) {
  pendingBalances.set(`${graphId}::${nodeId}`, { graphId, nodeId, calcs });
  if (balancesTimer) clearTimeout(balancesTimer);
  balancesTimer = setTimeout(flushBalances, BALANCES_DELAY_MS);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendingBalances.size) {
      flushBalances();
    }
  });
}

/** Закладка изменилась — отражаем правку на сервере. */
function syncBookmark(promise: Promise<void>) {
  promise.catch((e) => {
    console.warn("Не удалось сохранить закладку на сервере", e);
    showToast("error", "Закладка не сохранилась на сервере");
  });
}

/**
 * Синхронизация закладок, истории, расчётов баланса и идентификаторов
 * продуктов сохранённого графа с сервером.
 *
 * Локальное состояние остаётся ведущим — интерфейс обновляется сразу, а запрос
 * уходит следом. Пока полотно не сохранено (нет openedGraphId), синхронизировать
 * нечего: закладки и история копятся в памяти и уезжают на сервер при первом
 * сохранении (см. pushGraphExtras).
 */
export const graphExtrasMiddleware: Middleware =
  (store) => (next) => (action) => {
    const type = (action as { type?: string }).type;
    if (typeof type !== "string") return next(action);

    const before = store.getState() as RootState;
    const graphId = before.savedGraphs.openedGraphId;

    const result = next(action);
    const payload = (action as { payload?: unknown }).payload;

    // Смена графа (и кнопка «Очистить историю») обнуляет локальный список.
    // Очередь относится к прежнему полотну — выбрасываем её, не отправляя:
    // удалением истории на сервере заведует clearHistoryEverywhere.
    if (type === "history/clearHistory") {
      cancelTimer();
      pending = null;
      return result;
    }

    if (!graphId) return result;

    switch (type) {
      case "history/pushHistory": {
        const entry = payload as HistoryEntry;
        if (!isSyncableEntry(entry)) break;
        // Очередь всегда про один граф: на смене графа она сбрасывается выше.
        // Если id всё же разошёлся — доотправляем прежнюю пачку, а не смешиваем.
        if (pending && pending.graphId !== graphId) void flushPending();
        if (!pending) pending = { graphId, entries: [] };
        pending.entries.push(entry);
        scheduleFlush();
        break;
      }

      case "bookmarks/addBookmark": {
        const p = payload as {
          nodeId: string;
          label: string;
          kind: "product" | "transformation";
        };
        // Повторная закладка того же узла — не изменение: слайс её игнорирует.
        const existed = before.bookmarks.items.some(
          (b) => b.nodeId === p.nodeId,
        );
        if (!existed) {
          syncBookmark(
            putBookmark(graphId, p.nodeId, {
              label: p.label,
              kind: p.kind,
              note: "",
            }),
          );
        }
        break;
      }

      case "bookmarks/setBookmarkNote": {
        const p = payload as { nodeId: string; note: string };
        syncBookmark(putBookmark(graphId, p.nodeId, { note: p.note }));
        break;
      }

      case "bookmarks/removeBookmark": {
        syncBookmark(deleteBookmark(graphId, payload as string));
        break;
      }

      case "graph/updateNodeData": {
        // Расчёт баланса пришёл, убран или пересчитан на другое количество —
        // на сервер сразу, не дожидаясь сохранения графа: подпись «Все
        // изменения сохранены» расчётов не видит, и без этого при следующем
        // открытии графа их не было.
        const p = payload as { nodeId: string; data?: Record<string, unknown> };
        const calcs = p?.data?.materialBalances;
        if (p?.nodeId && Array.isArray(calcs)) {
          queueBalances(graphId, p.nodeId, calcs);
        }
        break;
      }

      case "graph/setProductIds": {
        // Справочник проставил идентификаторы (или отметил «спрошен») — на
        // сервер рядом с графом: в файл они попадают только с сохранением, и
        // без этого при каждом открытии справочник спрашивали обо всех
        // продуктах заново. Пишем то, что легло в узлы, с названием узла:
        // переименованный и не сохранённый граф чужой идентификатор не возьмёт.
        const after = store.getState() as RootState;
        const ids: Record<string, StoredProductId> = {};
        for (const nodeId of Object.keys((payload as object) ?? {})) {
          const d = after.graph.data.nodes.find((n) => n.id === nodeId)?.data;
          if (!d) continue;
          const productId = typeof d.productId === "string" ? d.productId : "";
          // Заданный человеком или из CAS — в файле графа, не здесь.
          if (productId && d.productIdSource !== "dictionary") continue;
          const version =
            typeof d.productIdVersion === "string" ? d.productIdVersion : undefined;
          if (!productId && !version) continue;
          ids[nodeId] = {
            ...(productId
              ? { productId, productIdSource: "dictionary" as const }
              : {}),
            ...(version ? { productIdVersion: version } : {}),
            productIdLabel: String(d.label ?? "").trim(),
          };
        }
        if (Object.keys(ids).length) {
          putProductIds(graphId, ids).catch((e) =>
            console.warn("Не удалось записать идентификаторы продуктов на сервере", e),
          );
        }
        break;
      }

      case "graph/removeNodes": {
        // Узлы ушли с полотна — их закладки указывают в пустоту. Локально их
        // убирает bookmarksSlice, на сервере убираем здесь.
        const removed = new Set((payload as string[]) ?? []);
        for (const b of before.bookmarks.items) {
          if (removed.has(b.nodeId)) {
            deleteBookmark(graphId, b.nodeId).catch((e) =>
              console.warn("Не удалось удалить закладку на сервере", e),
            );
          }
        }
        break;
      }
    }

    return result;
  };
