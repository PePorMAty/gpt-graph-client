// src/store/slices/materialBalanceSlice.ts
//
// Материальный баланс: режим на полотне, выбранное преобразование и его
// открытый расчёт или продукт, черновик формы (количество каждого сырья,
// выбранные продукты, свои данные), правки промпта, идущие расчёты и
// подсказки базы.
//
// Сами расчёты сюда не кладутся: они живут в данных узла преобразования
// (materialBalances) и сохраняются с графом — по одному на набор продуктов.
// Здесь — состояние сеанса.

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { Edge } from "@xyflow/react";

import {
  cancelBalanceJob,
  fetchBalanceJob,
  fetchBalancePrompt,
  fetchBalanceRecord,
  lookupBalance,
  startBalance,
  type BalanceNodeRef,
  type BalanceRecord,
  type BalanceSummary,
} from "../api/material-balance-api";
import type { AppDispatch, RootState } from "../store";
import type { CustomNode } from "../../types";
import { updateNodeData } from "./gptSlice";
import { getAiRequestFields } from "../../hooks/useAiConfig";
import {
  getNotificationCanvas,
  showToast,
} from "../../components/toast/toastStore";
import {
  balanceEnds,
  calcKey,
  calcsOf,
  defaultBasisId,
  inputRefs,
  nodeIdsFor,
  selectionFor,
  targetRefs,
  STATUS_TEXT,
  type BalanceAmounts,
  type BalanceInputAmount,
  type BalanceSelection,
  type BalanceUnit,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";

export type { BalanceSelection };

/** Количество сырья в форме: строкой — так поле можно очистить и вписать заново. */
export interface DraftAmount {
  amount: string;
  unit: BalanceUnit;
}

export interface BalanceDraft {
  /** По id узла сырья; нет или пусто — «сколько нужно». */
  amounts: Record<string, DraftAmount>;
  /**
   * Опорное сырьё: от его количества считает модель (id узла). Выбирается
   * явно; по умолчанию — основное невспомогательное (defaultBasisId).
   */
  basisId: string | null;
  /** id выбранных продуктов; null — все продукты преобразования. */
  targets: string[] | null;
  knownData: string;
}

export interface BalanceJobState {
  status: "starting" | "running" | "failed";
  /**
   * Номер запуска на клиенте. Отмена убирает задачу, и опрос, увидев, что
   * его запуска больше нет, молча заканчивается.
   */
  runId: string;
  jobId: string | null;
  startedAt: string;
  transformationId: string;
  /** Продукты расчёта (id узлов). */
  targetIds: string[];
  /** Что сейчас идёт на сервере — этап расчёта. */
  stage?: string;
  error?: string;
}

export interface BalanceLookupState {
  status: "loading" | "done" | "failed";
  exact: BalanceSummary | null;
  similar: BalanceSummary[];
}

interface MaterialBalanceState {
  /** Чип «Материальный баланс» включён. */
  mode: boolean;
  selection: BalanceSelection | null;
  /** Расчёт, открытый во вкладке последним: его числа — на узлах без выбора. */
  active: { nodeId: string; recordId: number } | null;
  draft: BalanceDraft;
  /**
   * Чей черновик: преобразование. Другое преобразование — черновик заново
   * (1 т основного сырья, все продукты): прежние количества вводили для
   * другого сырья, и они незаметно уходили бы в новый расчёт.
   */
  draftOwner: string | null;
  /** Правленый промпт; null — как на сервере по умолчанию. */
  prompt: { system: string | null; template: string | null };
  defaults: { system: string; template: string } | null;
  /** Идущие и упавшие расчёты — по преобразованию и продуктам (jobKey). */
  jobs: Record<string, BalanceJobState>;
  /** Подсказки базы — по lookupKey. */
  lookups: Record<string, BalanceLookupState>;
}

const DEFAULT_AMOUNT: DraftAmount = { amount: "1", unit: "т" };

const initialState: MaterialBalanceState = {
  mode: false,
  selection: null,
  active: null,
  draft: { amounts: {}, basisId: null, targets: null, knownData: "" },
  draftOwner: null,
  prompt: { system: null, template: null },
  defaults: null,
  jobs: {},
  lookups: {},
};

/**
 * Ключ расчёта преобразования с этими продуктами: под ним — идущая задача и
 * подсказки базы. Разные наборы продуктов считаются одновременно.
 */
export const jobKey = (transformationId: string, targetIds: string[]) =>
  `${transformationId}|${[...targetIds].sort().join("|")}`;

export const lookupKey = (transformationId: string, inputIds: string[], targetIds: string[]) =>
  `${jobKey(transformationId, targetIds)}|${[...inputIds].sort().join("|")}`;

/** Количество из поля: «1,5» и «1.5» — одно и то же; пусто, ноль, не число — null. */
export function draftAmount(text: string | undefined): number | null {
  const t = String(text ?? "").replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Черновик количеств по id узла — для слоя на полотне и формы. */
export function draftAmounts(draft: BalanceDraft): Record<string, BalanceInputAmount> {
  const out: Record<string, BalanceInputAmount> = {};
  for (const [id, a] of Object.entries(draft.amounts)) {
    out[id] = { amount: draftAmount(a.amount), unit: a.unit };
  }
  return out;
}

const labelOf = (n: CustomNode | undefined) => String(n?.data?.label ?? "").trim();

const nodeRef = (n: CustomNode): BalanceNodeRef => ({
  id: n.id,
  name: labelOf(n),
  ...(typeof n.data?.description === "string" && n.data.description.trim()
    ? { description: n.data.description }
    : {}),
});

/** Промпт по умолчанию — для редактора. */
export const loadBalancePrompt = createAsyncThunk(
  "materialBalance/loadPrompt",
  async () => {
    const p = await fetchBalancePrompt();
    return { system: p.system, template: p.template };
  },
);

/** Есть ли в базе готовый расчёт этого сырья и этих продуктов. */
export const lookupBalanceFor = createAsyncThunk(
  "materialBalance/lookup",
  async (
    arg: { transformationId: string; inputIds: string[]; targetIds: string[] },
    { getState },
  ) => {
    const { nodes } = (getState() as RootState).graph.data;
    const name = (id: string) => labelOf(nodes.find((n) => n.id === id));
    return lookupBalance({
      transformation: name(arg.transformationId),
      inputs: arg.inputIds.map(name).filter(Boolean),
      targets: arg.targetIds.map(name).filter(Boolean),
    });
  },
);

const slice = createSlice({
  name: "materialBalance",
  initialState,
  reducers: {
    setBalanceMode(state, action: PayloadAction<boolean>) {
      state.mode = action.payload;
      if (!action.payload) state.selection = null;
    },
    /**
     * Выбрать преобразование (или снять выбор). inputIds — его сырьё,
     * основное первым: новый черновик — 1 т основного, остальное «сколько
     * нужно».
     */
    selectBalanceTransformation(
      state,
      action: PayloadAction<{ selection: BalanceSelection | null; basisId?: string | null }>,
    ) {
      const { selection, basisId } = action.payload;
      state.selection = selection;
      if (!selection || selection.transformationId === state.draftOwner) return;
      state.draftOwner = selection.transformationId;
      state.draft.amounts = basisId ? { [basisId]: { ...DEFAULT_AMOUNT } } : {};
      state.draft.basisId = basisId ?? null;
      state.draft.targets = null;
    },
    /** Сделать сырьё опорным; пустое количество у него — 1 т. */
    setDraftBasis(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.draft.basisId = id;
      if (draftAmount(state.draft.amounts[id]?.amount) === null) {
        state.draft.amounts[id] = { amount: "1", unit: state.draft.amounts[id]?.unit ?? "т" };
      }
    },
    /** Открыть расчёт (номер записи) или форму нового (null). */
    openBalanceCalc(state, action: PayloadAction<number | null>) {
      if (!state.selection) return;
      state.selection.recordId = action.payload;
      state.selection.productId = null;
    },
    /** Провалиться в расчёт продукта (id узла) или вернуться к расчёту (null). */
    openBalanceProduct(state, action: PayloadAction<string | null>) {
      if (!state.selection) return;
      state.selection.productId = action.payload;
    },
    setBalanceActive(
      state,
      action: PayloadAction<{ nodeId: string; recordId: number } | null>,
    ) {
      state.active = action.payload;
    },
    /** Количество одного сырья в форме. */
    setDraftAmount(state, action: PayloadAction<{ inputId: string; amount: DraftAmount }>) {
      state.draft.amounts[action.payload.inputId] = action.payload.amount;
    },
    setDraftAmounts(state, action: PayloadAction<Record<string, DraftAmount>>) {
      state.draft.amounts = action.payload;
    },
    setDraftTargets(state, action: PayloadAction<string[] | null>) {
      state.draft.targets = action.payload;
    },
    setBalanceKnownData(state, action: PayloadAction<string>) {
      state.draft.knownData = action.payload;
    },
    setBalancePrompt(
      state,
      action: PayloadAction<{ system?: string | null; template?: string | null }>,
    ) {
      if (action.payload.system !== undefined) state.prompt.system = action.payload.system;
      if (action.payload.template !== undefined) state.prompt.template = action.payload.template;
    },
    jobStarted(
      state,
      action: PayloadAction<{
        key: string;
        runId: string;
        transformationId: string;
        targetIds: string[];
        startedAt: string;
      }>,
    ) {
      const { key, ...rest } = action.payload;
      state.jobs[key] = { status: "starting", jobId: null, ...rest };
    },
    jobRunning(
      state,
      action: PayloadAction<{ key: string; jobId: string; startedAt: string }>,
    ) {
      const job = state.jobs[action.payload.key];
      if (!job) return;
      job.status = "running";
      job.jobId = action.payload.jobId;
      job.startedAt = action.payload.startedAt || job.startedAt;
    },
    jobStage(state, action: PayloadAction<{ key: string; stage?: string }>) {
      const job = state.jobs[action.payload.key];
      if (job) job.stage = action.payload.stage;
    },
    /** Расчёт закончился: удачный — задача уходит, неудачный — остаётся с ошибкой. */
    jobEnded(state, action: PayloadAction<{ key: string; error?: string }>) {
      const { key, error } = action.payload;
      const job = state.jobs[key];
      if (!job) return;
      if (error) {
        job.status = "failed";
        job.error = error;
      } else {
        delete state.jobs[key];
      }
    },
    /** Скрыть ошибку расчёта — по jobKey. */
    dismissBalanceJob(state, action: PayloadAction<string>) {
      delete state.jobs[action.payload];
    },
  },
  extraReducers: (builder) => {
    const keyOf = (a: { transformationId: string; inputIds: string[]; targetIds: string[] }) =>
      lookupKey(a.transformationId, a.inputIds, a.targetIds);
    builder
      .addCase(loadBalancePrompt.fulfilled, (state, action) => {
        state.defaults = action.payload;
      })
      .addCase(lookupBalanceFor.pending, (state, action) => {
        state.lookups[keyOf(action.meta.arg)] = { status: "loading", exact: null, similar: [] };
      })
      .addCase(lookupBalanceFor.fulfilled, (state, action) => {
        state.lookups[keyOf(action.meta.arg)] = { status: "done", ...action.payload };
      })
      .addCase(lookupBalanceFor.rejected, (state, action) => {
        state.lookups[keyOf(action.meta.arg)] = { status: "failed", exact: null, similar: [] };
      });
  },
});

export const {
  setBalanceMode,
  openBalanceCalc,
  openBalanceProduct,
  setBalanceActive,
  setDraftAmount,
  setDraftAmounts,
  setDraftBasis,
  setDraftTargets,
  setBalanceKnownData,
  setBalancePrompt,
  dismissBalanceJob,
} = slice.actions;
const { jobStarted, jobRunning, jobStage, jobEnded } = slice.actions;

export default slice.reducer;

/** Как часто спрашивать сервер о ходе расчёта. */
const POLL_MS = 3000;
/** Сколько сбоев сети подряд терпеть, прежде чем сдаться. */
const MAX_POLL_MISSES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let runSeq = 0;

/**
 * Выбрать преобразование: открыть его расчёт (prefer — номер записи, иначе
 * свежий) или форму нового, если расчётов нет. null — снять выбор.
 */
export const pickBalanceTransformation =
  (transformationId: string | null, prefer?: { recordId?: number | null; productId?: string | null }) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    if (!transformationId) {
      dispatch(slice.actions.selectBalanceTransformation({ selection: null }));
      return;
    }
    const { nodes, edges } = getState().graph.data;
    const node = nodes.find((n) => n.id === transformationId);
    const selection = selectionFor(node, transformationId, prefer?.recordId);
    if (prefer?.productId && selection.recordId !== null) selection.productId = prefer.productId;
    const { ins } = balanceEnds(transformationId, nodes, edges);
    dispatch(
      slice.actions.selectBalanceTransformation({ selection, basisId: defaultBasisId(node, ins) }),
    );
  };

/**
 * Щелчок по продукту на полотне: если это продукт открытого расчёта —
 * провалиться в его расчёт (true). Иначе ничего (false) — откроется
 * карточка.
 */
export const focusBalanceProduct =
  (productId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { selection } = getState().materialBalance;
    if (!selection || selection.recordId === null) return false;
    const node = getState().graph.data.nodes.find((n) => n.id === selection.transformationId);
    const calc = calcsOf(node).find((c) => c.record.id === selection.recordId);
    if (!calc || !targetRefs(calc.record).some((r) => calc.nodeIds[r.ref] === productId)) {
      return false;
    }
    dispatch(openBalanceProduct(productId));
    return true;
  };

/** Черновик количеств — по обозначениям расчёта (через узлы). */
function amountsForRecord(
  record: BalanceRecord,
  nodeIds: Record<string, string>,
  draft: Record<string, DraftAmount>,
): BalanceAmounts {
  const out: BalanceAmounts = {};
  for (const r of inputRefs(record)) {
    const a = draft[nodeIds[r.ref] ?? ""];
    out[r.ref] = { amount: draftAmount(a?.amount), unit: a?.unit ?? "т" };
  }
  // Ни одно количество не легло на сырьё расчёта — то, с которым считала
  // модель: иначе пересчитывать не из чего.
  if (!Object.values(out).some((a) => a.amount !== null)) {
    const basis = inputRefs(record).find((r) => r.role === "basis");
    const b = record.basisAmount;
    if (basis) {
      const unit = (["кг", "т", "тыс. т"] as string[]).includes(b?.unit ?? "")
        ? (b!.unit as BalanceUnit)
        : "т";
      out[basis.ref] = { amount: b?.amount ?? 1, unit };
    }
  }
  return out;
}

/**
 * Положить расчёт в узел преобразования. У набора продуктов один расчёт:
 * новый заменяет прежний тех же продуктов; расчёты других наборов
 * остаются. Если преобразование выбрано — открыть новый расчёт.
 */
function attachCalc(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: {
    transformationId: string;
    record: BalanceRecord;
    hint?: Record<string, string>;
    draft: Record<string, DraftAmount>;
    fromCache: boolean;
  },
): boolean {
  const { nodes, edges } = getState().graph.data;
  const node = nodes.find((n) => n.id === args.transformationId);
  if (!node) return false;
  const { ins, outs } = balanceEnds(node.id, nodes, edges);
  const nodeIds = nodeIdsFor(args.record, { transformationId: node.id, ins, outs }, args.hint);
  const calc: MaterialBalanceCalc = {
    record: args.record,
    nodeIds,
    ...(args.fromCache ? { fromCache: true } : {}),
    addedAt: new Date().toISOString(),
    amounts: amountsForRecord(args.record, nodeIds, args.draft),
  };
  const key = calcKey(calc);
  const rest = calcsOf(node).filter((c) => calcKey(c) !== key && c.record.id !== args.record.id);
  dispatch(
    updateNodeData({ nodeId: node.id, data: { materialBalances: [calc, ...rest] } }),
  );
  dispatch(setBalanceActive({ nodeId: node.id, recordId: args.record.id }));
  // Преобразование открыто — во вкладке готовый расчёт, а не форма.
  if (getState().materialBalance.selection?.transformationId === node.id) {
    dispatch(openBalanceCalc(args.record.id));
  }
  return true;
}

/** Что уйдёт в запрос: сырьё, продукты, опорное сырьё с количеством. */
export function balanceRequestOf(
  args: { nodes: CustomNode[]; edges: Edge[]; draft: BalanceDraft },
  transformationId: string,
) {
  const { nodes, edges, draft } = args;
  const { ins, outs } = balanceEnds(transformationId, nodes, edges);
  const targets = outs.filter((n) => !draft.targets || draft.targets.includes(n.id));
  // Опорное — выбранное, если у него есть количество. Выбранного нет на
  // графе — первое сырьё с количеством.
  const set = (n: CustomNode) => draftAmount(draft.amounts[n.id]?.amount) !== null;
  const chosen = ins.find((n) => n.id === draft.basisId);
  const basis = chosen ? (set(chosen) ? chosen : undefined) : ins.find(set);
  return { ins, outs, targets, basis, chosen };
}

/**
 * Рассчитать баланс выбранного преобразования: всё его сырьё, выбранные
 * продукты, количество опорного сырья из формы.
 *
 * Обычный запрос сервер может закрыть готовым расчётом из базы — тогда
 * ответ сразу. Иначе расчёт идёт в фоне, а мы спрашиваем ход, пока он не
 * кончится. Граф за это время могли сменить: тогда в новый граф ничего не
 * кладём — ответ уже в базе сервера, и на том же преобразовании
 * «Рассчитать» возьмёт его сразу.
 *
 * «Отменить расчёт» (cancelMaterialBalance) убирает задачу: опрос это видит
 * и заканчивается, ничего не положив в граф.
 */
export const runMaterialBalance =
  (opts: { force?: boolean } = {}) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState();
    const sel = state.materialBalance.selection;
    if (!sel) return;
    const t = state.graph.data.nodes.find((n) => n.id === sel.transformationId);
    if (!t) return;
    const { ins, outs, targets, basis } = balanceRequestOf(
      { ...state.graph.data, draft: state.materialBalance.draft },
      t.id,
    );
    if (!ins.length || !targets.length || !basis) return;
    const targetIds = targets.map((n) => n.id);
    const key = jobKey(t.id, targetIds);
    // Расчёт этих продуктов уже идёт или запускается — второй щелчок не
    // запускает второй.
    const current = state.materialBalance.jobs[key]?.status;
    if (current === "running" || current === "starting") return;

    const { draft, prompt } = state.materialBalance;
    const draftSnapshot = { ...draft.amounts };
    const basisAmount = draft.amounts[basis.id];
    const tLabel = labelOf(t);
    const what = `→ ${targets.map(labelOf).join(", ")}`;
    const canvas = getNotificationCanvas();
    const nodeTarget = { nodeId: t.id, label: tLabel };

    const runId = `${Date.now()}-${++runSeq}`;
    dispatch(
      jobStarted({
        key,
        runId,
        transformationId: t.id,
        targetIds,
        startedAt: new Date().toISOString(),
      }),
    );
    /** Запуск не отменили. */
    const alive = () => getState().materialBalance.jobs[key]?.runId === runId;

    const fail = (message: string) => {
      dispatch(jobEnded({ key, error: message }));
      showToast("error", `Материальный баланс не рассчитан: «${tLabel}»`, message, {
        canvas,
        target: nodeTarget,
      });
    };

    const finish = (record: BalanceRecord, fromCache: boolean, hint?: Record<string, string>) => {
      dispatch(jobEnded({ key }));
      if (getNotificationCanvas() !== canvas) {
        showToast(
          "info",
          `Материальный баланс готов: «${tLabel}»`,
          "Граф с этим преобразованием закрыт. Расчёт сохранён в базе: откройте граф и нажмите «Рассчитать» — он придёт сразу.",
          { canvas },
        );
        return;
      }
      const attached = attachCalc(dispatch, getState, {
        transformationId: t.id,
        record,
        hint,
        draft: draftSnapshot,
        fromCache,
      });
      if (!attached) {
        showToast(
          "info",
          `Материальный баланс готов, но «${tLabel}» на графе уже нет`,
          "Расчёт сохранён в базе: на таком же преобразовании «Рассчитать» возьмёт его сразу.",
          { canvas },
        );
        return;
      }
      // Готовое из базы приходит сразу — человек и так смотрит на вкладку.
      if (!fromCache) {
        showToast(
          record.status === "calculated" || record.status === "partial" ? "success" : "info",
          `Материальный баланс: «${tLabel}»`,
          `${what} · ${STATUS_TEXT[record.status]}`,
          { canvas, target: nodeTarget },
        );
      }
    };

    let started;
    try {
      started = await startBalance({
        transformation: nodeRef(t),
        inputs: ins.map(nodeRef),
        outputs: outs.map(nodeRef),
        targets: targetIds,
        basis: {
          id: basis.id,
          amount: draftAmount(basisAmount?.amount) ?? 1,
          unit: basisAmount?.unit ?? "т",
        },
        ...(draft.knownData.trim() ? { knownData: draft.knownData.trim() } : {}),
        ...(prompt.system ? { system: prompt.system } : {}),
        ...(prompt.template ? { template: prompt.template } : {}),
        ...getAiRequestFields({ stage: "search" }),
        ...(opts.force ? { force: true } : {}),
      });
    } catch (e) {
      if (alive()) fail(e instanceof Error ? e.message : String(e));
      return;
    }

    if (!alive()) {
      // Отменили, пока сервер принимал запрос: номера задачи тогда ещё не
      // было, и снять её на сервере может только этот запуск.
      if (!started.fromCache) void cancelBalanceJob(started.jobId).catch(() => {});
      return;
    }

    if (started.fromCache) {
      finish(started.result, true, started.nodeIds);
      return;
    }

    dispatch(jobRunning({ key, jobId: started.jobId, startedAt: started.startedAt }));

    let misses = 0;
    for (;;) {
      await sleep(POLL_MS);
      if (!alive()) return;
      let job;
      try {
        job = await fetchBalanceJob(started.jobId);
        misses = 0;
      } catch (e) {
        if (!alive()) return;
        const message = e instanceof Error ? e.message : String(e);
        // Сервер перезапускался — задачи больше нет, ждать нечего.
        if (/не найден/i.test(message) || ++misses >= MAX_POLL_MISSES) {
          fail(message);
          return;
        }
        continue;
      }
      if (!alive()) return;
      if (job.status === "running") {
        dispatch(jobStage({ key, stage: job.stage }));
        continue;
      }
      // Такой же расчёт отменили из другой вкладки или другим человеком:
      // задача на сервере общая.
      if (job.status === "cancelled") {
        fail("Расчёт отменили. Запустите его заново, если он нужен.");
        return;
      }
      if (job.status === "failed" || !job.result) {
        fail(job.error || "Расчёт завершился без ответа");
        return;
      }
      finish(job.result, false);
      return;
    }
  };

/**
 * Взять готовый расчёт из базы — из подсказки «в базе есть расчёт …».
 * Заменяет расчёт тех же продуктов, если он был.
 */
export const takeBalanceFromBase =
  (recordId: number) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const { selection: sel, draft } = getState().materialBalance;
    if (!sel) return;
    try {
      const record = await fetchBalanceRecord(recordId);
      attachCalc(dispatch, getState, {
        transformationId: sel.transformationId,
        record,
        draft: draft.amounts,
        fromCache: true,
      });
    } catch (e) {
      showToast(
        "error",
        "Не удалось взять расчёт из базы",
        e instanceof Error ? e.message : String(e),
      );
    }
  };

/**
 * «Отменить расчёт» (jobKey): опрос заканчивается, сервер обрывает запрос к
 * модели и ответ в базу не пишет.
 */
export const cancelMaterialBalance =
  (key: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const job = getState().materialBalance.jobs[key];
    if (!job) return;
    dispatch(slice.actions.dismissBalanceJob(key));
    // Номера задачи ещё нет — сервер не ответил на запуск. Снимет её сам
    // запуск, когда ответ придёт (runMaterialBalance).
    if (!job.jobId) return;
    try {
      await cancelBalanceJob(job.jobId);
    } catch {
      // Задача уже закончилась или сервер перезапускался — обрывать нечего.
    }
  };

/** Убрать расчёт из графа (в базе сервера он остаётся). */
export const removeMaterialBalance =
  (nodeId: string, recordId: number) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const node = getState().graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const rest = calcsOf(node).filter((c) => c.record.id !== recordId);
    dispatch(updateNodeData({ nodeId, data: { materialBalances: rest } }));
    const { active, selection } = getState().materialBalance;
    if (active?.nodeId === nodeId && active.recordId === recordId) {
      dispatch(setBalanceActive(null));
    }
    if (selection?.transformationId === nodeId && selection.recordId === recordId) {
      dispatch(openBalanceCalc(rest[0]?.record.id ?? null));
    }
  };

/** Сменить количество сырья расчёта — пересчёт без модели. */
export const setMaterialBalanceAmounts =
  (nodeId: string, recordId: number, amounts: BalanceAmounts) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const node = getState().graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const next = calcsOf(node).map((c) =>
      c.record.id === recordId ? { ...c, amounts, view: undefined } : c,
    );
    dispatch(updateNodeData({ nodeId, data: { materialBalances: next } }));
  };

/**
 * «Новый расчёт» от открытого: форма с его количествами и продуктами.
 */
export const newCalcFrom =
  (calc: MaterialBalanceCalc, amounts: BalanceAmounts) =>
  (dispatch: AppDispatch): void => {
    const draft: Record<string, DraftAmount> = {};
    for (const [ref, a] of Object.entries(amounts)) {
      const id = calc.nodeIds[ref];
      if (!id) continue;
      draft[id] = { amount: a.amount === null ? "" : String(a.amount).replace(".", ","), unit: a.unit };
    }
    dispatch(setDraftAmounts(draft));
    const basis = calc.record.refs.find((r) => r.role === "basis");
    const basisId = basis ? calc.nodeIds[basis.ref] : undefined;
    if (basisId) dispatch(setDraftBasis(basisId));
    const targets = Object.entries(calc.nodeIds)
      .filter(([ref]) => calc.record.refs.some((r) => r.ref === ref && r.role === "target"))
      .map(([, id]) => id);
    dispatch(setDraftTargets(targets.length ? targets : null));
    dispatch(openBalanceCalc(null));
  };
