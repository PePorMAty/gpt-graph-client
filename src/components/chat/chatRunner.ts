// Выполнить предложение ИИ (PG-MIGRATION.md, этап 4.4).
//
// Одна функция на оба режима чата: в режиме с подтверждением её зовёт кнопка
// карточки, в автопилоте — сам чат, по всем действиям ответа подряд. Каждое
// действие — то же, что делает человек: шаг — мастер шага (на автопилоте,
// stepAutopilot.ts), коды — окно «Определить коды», баланс — расчёт во
// вкладке карточки, переименование и объединение — правки Flow.
//
// Возвращает итог строкой — его чат показывает под карточкой и в автопилоте
// отправляет модели («Автопилот: шаг добавлен, новые продукты …»), чтобы она
// продолжила задачу от того, что получилось на самом деле.

import type { Store } from "@reduxjs/toolkit";

import type { AppDispatch, RootState } from "../../store/store";
import type { ChatProposal } from "../../store/api/chat-api";
import { runMaterialBalance } from "../../store/slices/materialBalanceSlice";
import { startAutoStep } from "../flow-panel/stepAutopilot";
import {
  requestAdd,
  requestCardTab,
  requestCodes,
  requestDelete,
  requestLayout,
  requestMerge,
  requestRename,
  requestStep,
  showNodes,
} from "./chatActions";

export type ChatMode = "confirm" | "auto";
export type AppStore = Store<RootState> & { dispatch: AppDispatch };

/** Итог действия: ok — сделано (или открыто человеку), text — что вышло. */
export interface ProposalOutcome {
  ok: boolean;
  text: string;
}

/**
 * Действия, после которых автопилот спрашивает модель, что дальше: граф
 * другой, или найдено то, от чего зависит следующий ход (источники).
 */
export const GRAPH_CHANGES: ChatProposal["kind"][] = ["step", "add", "rename", "merge", "delete", "sources"];

const DIR = { up: "вверх", down: "вниз" } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (s: string) => `«${s}»`;

/** Дождаться условия: состояние меняется после событий окна и перерисовки. */
async function waitFor(test: () => boolean, ms: number): Promise<boolean> {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (test()) return true;
  return test();
}

export async function executeProposal(p: ChatProposal, mode: ChatMode, store: AppStore): Promise<ProposalOutcome> {
  const nodes = () => store.getState().graph.data.nodes;
  const exists = (id: string) => nodes().some((n) => n.id === id);
  const gone = (label: string): ProposalOutcome => ({ ok: false, text: `узла ${q(label)} уже нет на графе` });

  switch (p.kind) {
    case "show":
    case "codes": {
      const present = p.nodes.filter((n) => exists(n.id));
      if (!present.length) return { ok: false, text: "этих узлов уже нет на графе" };
      const names = present.map((n) => q(n.label)).join(", ");
      if (p.kind === "show") {
        showNodes(present.map((n) => n.id));
        return { ok: true, text: `показаны на графе: ${names}` };
      }
      // В автопилоте окно само запускает подбор — это запросы к модели.
      requestCodes(present.map((n) => n.id), mode === "auto");
      return { ok: true, text: mode === "auto" ? `коды подбираются в окне «Определить коды»: ${names}` : `открыто окно кодов: ${names}` };
    }

    case "add": {
      const id = requestAdd(p.label, p.nearId);
      return id ? { ok: true, text: `добавлен продукт ${q(p.label)}${p.nearLabel ? ` рядом с ${q(p.nearLabel)}` : ""}` } : { ok: false, text: `продукт ${q(p.label)} не добавлен` };
    }

    case "rename":
      if (!exists(p.nodeId)) return gone(p.label);
      return requestRename(p.nodeId, p.newLabel)
        ? { ok: true, text: `${q(p.label)} переименован в ${q(p.newLabel)}` }
        : { ok: false, text: `${q(p.label)} не переименован (граф только для чтения?)` };

    case "merge":
      if (!exists(p.fromId)) return gone(p.fromLabel);
      if (!exists(p.intoId)) return gone(p.intoLabel);
      return requestMerge(p.fromId, p.intoId)
        ? { ok: true, text: `${q(p.fromLabel)} объединён с ${q(p.intoLabel)}` }
        : { ok: false, text: `${q(p.fromLabel)} и ${q(p.intoLabel)} не объединены` };

    case "tech":
      if (!exists(p.nodeId)) return gone(p.label);
      requestCardTab(p.nodeId, "tech");
      return { ok: true, text: `открыто технологическое описание ${q(p.label)}` };

    case "balance":
      return runBalance(p.nodeId, p.label, store, exists);

    case "step":
      return runStep(p, mode, store, exists);

    case "sources":
      return runSources(p, exists);

    case "delete": {
      const present = p.nodes.filter((n) => exists(n.id));
      if (!present.length) return { ok: false, text: "этих узлов уже нет на графе" };
      const names = present.map((n) => q(n.label)).join(", ");
      return requestDelete(present.map((n) => n.id))
        ? { ok: true, text: `удалены со связями: ${names}` }
        : { ok: false, text: `не удалены: ${names} (граф только для чтения?)` };
    }

    case "layout":
      return requestLayout()
        ? { ok: true, text: "граф разложен заново" }
        : { ok: false, text: "граф не разложен: в «Фокусе» и на пустом графе раскладки нет" };
  }
}

/**
 * Источники: мастер у продукта проходит только первый этап — база, а нет её
 * (или просили интернет) — поиск моделью. Шаг не строится: найденное ждёт в
 * мастере, «Построить шаг» его возьмёт.
 */
async function runSources(
  p: Extract<ChatProposal, { kind: "sources" }>,
  exists: (id: string) => boolean,
): Promise<ProposalOutcome> {
  if (!exists(p.nodeId)) return { ok: false, text: `узла ${q(p.label)} уже нет на графе` };
  const what = `источники для ${q(p.label)} (${DIR[p.direction]}${p.web ? ", поиск в интернете" : ""})`;
  const result = startAutoStep(p.nodeId, p.direction, "sources", { web: !!p.web });
  requestStep(p.nodeId, p.label, p.direction);
  const r = await result;
  if (r.status === "cancelled") return { ok: false, text: `поиск: ${what} — остановлен` };
  if (r.status !== "sources") return { ok: false, text: `${what}: ${r.error ?? "не нашлись"}` };
  const list = (r.sources ?? []).map(q).join("; ");
  return { ok: true, text: `${what}: ${r.sourcesCount ?? 0} — ${list} (в мастере шага; шаг из них — «Построить шаг»)` };
}

/**
 * Баланс: вкладка карточки преобразования выбирает его для расчёта, дальше —
 * как кнопка «Рассчитать». Готовый расчёт из базы приходит за секунды — ждём
 * его; новый идёт минуты — не держим чат, итог придёт уведомлением.
 */
async function runBalance(
  nodeId: string,
  label: string,
  store: AppStore,
  exists: (id: string) => boolean,
): Promise<ProposalOutcome> {
  if (!exists(nodeId)) return { ok: false, text: `узла ${q(label)} уже нет на графе` };
  requestCardTab(nodeId, "balance");
  const picked = await waitFor(() => store.getState().materialBalance.selection?.transformationId === nodeId, 5000);
  if (!picked) return { ok: false, text: `баланс ${q(label)}: вкладка не открылась` };
  const calcs = () =>
    (store.getState().graph.data.nodes.find((n) => n.id === nodeId)?.data?.materialBalances as unknown[] | undefined)?.length ?? 0;
  const before = calcs();
  const jobs = () => Object.keys(store.getState().materialBalance.jobs).length;
  const jobsBefore = jobs();
  const running = store.dispatch(runMaterialBalance());
  const finished = await Promise.race([running.then(() => true), sleep(20000).then(() => false)]);
  if (finished && calcs() > before) return { ok: true, text: `баланс ${q(label)} рассчитан — во вкладке «Материальный баланс»` };
  if (finished && jobs() === jobsBefore && calcs() === before) {
    return { ok: false, text: `баланс ${q(label)} не запущен: у преобразования нет сырья или продуктов` };
  }
  return { ok: true, text: `расчёт баланса ${q(label)} идёт — займёт минуты, итог придёт уведомлением` };
}

/**
 * Шаг: мастер у узла проходит этапы сам (stepAutopilot.ts). В автопилоте —
 * с «Добавить шаг», с подтверждением — до превью: добавляет человек.
 */
async function runStep(
  p: Extract<ChatProposal, { kind: "step" }>,
  mode: ChatMode,
  store: AppStore,
  exists: (id: string) => boolean,
): Promise<ProposalOutcome> {
  if (!exists(p.nodeId)) return { ok: false, text: `узла ${q(p.label)} уже нет на графе` };
  const what = `шаг ${DIR[p.direction]} от ${q(p.label)}`;
  const before = new Set(store.getState().graph.data.nodes.map((n) => n.id));
  const result = startAutoStep(p.nodeId, p.direction, mode === "auto" ? "add" : "preview");
  requestStep(p.nodeId, p.label, p.direction);
  const r = await result;
  if (r.status === "preview") return { ok: true, text: `превью: ${what} — посмотрите и нажмите «Добавить шаг»` };
  if (r.status === "cancelled") return { ok: false, text: `${what} остановлен` };
  if (r.status === "failed") return { ok: false, text: `${what} не построен: ${r.error ?? "ошибка"}` };
  // Раскладка шага на полотне идёт следом — новые узлы появляются не сразу.
  await sleep(1200);
  const added = store.getState().graph.data.nodes.filter((n) => !before.has(n.id));
  const label = (n: (typeof added)[number]) => q(String(n.data?.label ?? ""));
  const alt = (n: (typeof added)[number]) => n.data?.chainVariant === "alt";
  const transformations = added.filter((n) => n.type === "transformation" && !alt(n)).map(label);
  const products = added.filter((n) => n.type === "product" && !alt(n)).map(label);
  const alternatives = added.filter(alt).map(label);
  const parts = [
    transformations.length ? `преобразование ${transformations.join(", ")}` : "",
    products.length ? `новые продукты ${products.join(", ")}` : "",
    alternatives.length ? `альтернативы ${alternatives.join(", ")}` : "",
  ].filter(Boolean);
  return { ok: true, text: parts.length ? `${what} добавлен — ${parts.join("; ")}` : `${what} добавлен, новых узлов нет (продукты уже были на графе)` };
}
