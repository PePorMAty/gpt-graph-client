// src/store/slices/materialBalanceSlice.ts
//
// Материальный баланс: режим на полотне, выбранное преобразование и пара,
// черновик количества и своих данных, правки промпта, идущие расчёты и
// подсказки базы.
//
// Сами расчёты сюда не кладутся: они живут в данных узла преобразования
// (materialBalances) и сохраняются с графом — по одному на пару «сырьё →
// продукт». Здесь — состояние сеанса.

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

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
  nodeIdsFor,
  pairFor,
  STATUS_TEXT,
  type BalanceSelection,
  type BalanceUnit,
  type BalanceView,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";

export type { BalanceSelection };

export interface BalanceDraft {
  /** Количество строкой: так поле можно очистить и вписать заново. */
  amount: string;
  unit: BalanceUnit;
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
  inputId: string;
  outputId: string;
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
  /**
   * У выбранной пары уже есть расчёт, а человек нажал «Новый расчёт» — во
   * вкладке форма запроса вместо готовых данных.
   */
  formOpen: boolean;
  draft: BalanceDraft;
  /**
   * Чьё количество в черновике: преобразование и сырьё пары (draftOwnerOf).
   * Другое преобразование или другое сырьё — количество снова 1 т: прежнее
   * вводили для другого сырья, и оно незаметно уходило в новый расчёт.
   */
  draftOwner: string | null;
  /** Правленый промпт; null — как на сервере по умолчанию. */
  prompt: { system: string | null; template: string | null };
  defaults: { system: string; template: string } | null;
  /** Идущие и упавшие расчёты — по преобразованию и паре (jobKey). */
  jobs: Record<string, BalanceJobState>;
  /** Подсказки базы — по lookupKey. */
  lookups: Record<string, BalanceLookupState>;
}

const initialState: MaterialBalanceState = {
  mode: false,
  selection: null,
  active: null,
  formOpen: false,
  draft: { amount: "1", unit: "т", knownData: "" },
  draftOwner: null,
  prompt: { system: null, template: null },
  defaults: null,
  jobs: {},
  lookups: {},
};

/**
 * Ключ расчёта пары: под ним — идущая задача и подсказки базы. Разные пары
 * одного преобразования считаются одновременно.
 */
export const lookupKey = (transformationId: string, inputId: string, outputId: string) =>
  `${transformationId}|${inputId}|${outputId}`;

export const jobKey = lookupKey;

const draftOwnerOf = (sel: BalanceSelection | null) =>
  sel ? `${sel.transformationId}|${sel.inputId ?? ""}` : null;

/**
 * Выбрали пару с другим сырьём — количество снова 1 т. Снятый выбор
 * черновик не трогает: вернувшись к той же паре, человек видит то, что
 * вводил.
 */
function takeDraft(state: MaterialBalanceState) {
  const owner = draftOwnerOf(state.selection);
  if (!owner || owner === state.draftOwner) return;
  state.draftOwner = owner;
  state.draft.amount = initialState.draft.amount;
  state.draft.unit = initialState.draft.unit;
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

/** Есть ли в базе готовый расчёт этой пары. */
export const lookupBalanceFor = createAsyncThunk(
  "materialBalance/lookup",
  async (
    arg: {
      transformationId: string;
      inputId: string;
      outputId: string;
    },
    { getState },
  ) => {
    const { nodes } = (getState() as RootState).graph.data;
    const byId = (id: string) => nodes.find((n) => n.id === id);
    return lookupBalance({
      transformation: labelOf(byId(arg.transformationId)),
      basis: labelOf(byId(arg.inputId)),
      target: labelOf(byId(arg.outputId)),
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
    selectBalanceTransformation(
      state,
      action: PayloadAction<BalanceSelection | null>,
    ) {
      state.selection = action.payload;
      state.formOpen = false;
      takeDraft(state);
    },
    setBalanceFormOpen(state, action: PayloadAction<boolean>) {
      state.formOpen = action.payload;
    },
    setBalancePair(
      state,
      action: PayloadAction<{ inputId?: string; outputId?: string }>,
    ) {
      if (!state.selection) return;
      state.formOpen = false;
      if (action.payload.inputId) state.selection.inputId = action.payload.inputId;
      if (action.payload.outputId) state.selection.outputId = action.payload.outputId;
      takeDraft(state);
    },
    setBalanceActive(
      state,
      action: PayloadAction<{ nodeId: string; recordId: number } | null>,
    ) {
      state.active = action.payload;
    },
    setBalanceDraft(state, action: PayloadAction<Partial<BalanceDraft>>) {
      state.draft = { ...state.draft, ...action.payload };
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
        inputId: string;
        outputId: string;
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
    const keyOf = (a: { transformationId: string; inputId: string; outputId: string }) =>
      lookupKey(a.transformationId, a.inputId, a.outputId);
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
  selectBalanceTransformation,
  setBalanceFormOpen,
  setBalancePair,
  setBalanceActive,
  setBalanceDraft,
  setBalancePrompt,
  dismissBalanceJob,
} = slice.actions;
const { jobStarted, jobRunning, jobEnded } = slice.actions;

export default slice.reducer;

/** Как часто спрашивать сервер о ходе расчёта. */
const POLL_MS = 3000;
/** Сколько сбоев сети подряд терпеть, прежде чем сдаться. */
const MAX_POLL_MISSES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let runSeq = 0;

/** Количество из поля: «1,5» и «1.5» — одно и то же; пусто и ноль — 1. */
export function draftAmount(text: string): number {
  const v = Number(String(text).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * Щелчок по преобразованию в режиме баланса: выбрать его и пару — свежего
 * расчёта, а нет расчётов — основную (pairFor).
 */
export const pickBalanceTransformation =
  (transformationId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const { nodes, edges } = getState().graph.data;
    dispatch(selectBalanceTransformation(pairFor(transformationId, nodes, edges)));
  };

/**
 * Положить расчёт в узел преобразования. У пары один расчёт: новый заменяет
 * прежний той же пары (и старые лишние из прежних версий); расчёты других
 * пар остаются.
 */
function attachCalc(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: {
    transformationId: string;
    record: BalanceRecord;
    inputId: string;
    outputId: string;
    fromCache: boolean;
    view: BalanceView;
  },
): boolean {
  const { nodes, edges } = getState().graph.data;
  const node = nodes.find((n) => n.id === args.transformationId);
  if (!node) return false;
  const { ins, outs } = balanceEnds(node.id, nodes, edges);
  const calc: MaterialBalanceCalc = {
    record: args.record,
    nodeIds: nodeIdsFor(args.record, {
      transformationId: node.id,
      inputId: args.inputId,
      outputId: args.outputId,
      ins,
      outs,
    }),
    ...(args.fromCache ? { fromCache: true } : {}),
    addedAt: new Date().toISOString(),
    view: args.view,
  };
  const key = calcKey(calc);
  const rest = calcsOf(node).filter((c) => calcKey(c) !== key);
  dispatch(
    updateNodeData({ nodeId: node.id, data: { materialBalances: [calc, ...rest] } }),
  );
  dispatch(setBalanceActive({ nodeId: node.id, recordId: args.record.id }));
  // Расчёт готов — во вкладке его данные, а не форма запроса.
  dispatch(slice.actions.setBalanceFormOpen(false));
  return true;
}

/**
 * Рассчитать баланс выбранной пары: сколько продукта получится из сырья.
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
    if (!sel?.inputId || !sel.outputId) return;
    const { nodes, edges } = state.graph.data;
    const byId = (id: string) => nodes.find((n) => n.id === id);
    const t = byId(sel.transformationId);
    const input = byId(sel.inputId);
    const output = byId(sel.outputId);
    if (!t || !input || !output) return;
    const key = jobKey(t.id, input.id, output.id);
    // Расчёт этой пары уже идёт или запускается — второй щелчок не запускает
    // второй.
    const current = state.materialBalance.jobs[key]?.status;
    if (current === "running" || current === "starting") return;

    const { ins, outs } = balanceEnds(t.id, nodes, edges);
    const { draft, prompt } = state.materialBalance;
    const view: BalanceView = { amount: draftAmount(draft.amount), unit: draft.unit };
    const tLabel = labelOf(t);
    const pair = `${labelOf(input)} → ${labelOf(output)}`;
    const canvas = getNotificationCanvas();
    const nodeTarget = { nodeId: t.id, label: tLabel };

    const runId = `${Date.now()}-${++runSeq}`;
    dispatch(
      jobStarted({
        key,
        runId,
        inputId: input.id,
        outputId: output.id,
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

    const finish = (record: BalanceRecord, fromCache: boolean) => {
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
        inputId: input.id,
        outputId: output.id,
        fromCache,
        view,
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
          `${pair} · ${STATUS_TEXT[record.status]}`,
          { canvas, target: nodeTarget },
        );
      }
    };

    let started;
    try {
      started = await startBalance({
        transformation: nodeRef(t),
        basis: nodeRef(input),
        target: nodeRef(output),
        inputs: ins.map(nodeRef),
        outputs: outs.map(nodeRef),
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
      finish(started.result, true);
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
      if (job.status === "running") continue;
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
 * Взять готовый расчёт из базы — из подсказки «есть расчёт по технологии …».
 * Он той же пары (подсказки базы — по ней) и заменяет её расчёт.
 */
export const takeBalanceFromBase =
  (recordId: number) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const { selection: sel, draft } = getState().materialBalance;
    if (!sel?.inputId || !sel.outputId) return;
    try {
      const record = await fetchBalanceRecord(recordId);
      attachCalc(dispatch, getState, {
        transformationId: sel.transformationId,
        record,
        inputId: sel.inputId,
        outputId: sel.outputId,
        fromCache: true,
        view: { amount: draftAmount(draft.amount), unit: draft.unit },
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
 * «Отменить расчёт» пары (jobKey): опрос заканчивается, сервер обрывает
 * запрос к модели и ответ в базу не пишет. Во вкладке — снова прежний
 * расчёт пары, если он был, иначе форма запроса.
 */
export const cancelMaterialBalance =
  (key: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const job = getState().materialBalance.jobs[key];
    if (!job) return;
    dispatch(slice.actions.dismissBalanceJob(key));
    dispatch(slice.actions.setBalanceFormOpen(false));
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
    const active = getState().materialBalance.active;
    if (active?.nodeId === nodeId && active.recordId === recordId) {
      dispatch(setBalanceActive(null));
    }
  };

/** Сменить количество или единицу показа расчёта. */
export const setMaterialBalanceView =
  (nodeId: string, recordId: number, view: BalanceView) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const node = getState().graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const next = calcsOf(node).map((c) =>
      c.record.id === recordId ? { ...c, view } : c,
    );
    dispatch(updateNodeData({ nodeId, data: { materialBalances: next } }));
  };
