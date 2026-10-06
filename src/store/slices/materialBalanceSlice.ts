// src/store/slices/materialBalanceSlice.ts
//
// Материальный баланс: режим на полотне, выбранное преобразование, черновик
// базиса и своих данных, правки промпта, идущие расчёты и подсказки базы.
//
// Сами расчёты сюда не кладутся: они живут в данных узла преобразования
// (materialBalances) и сохраняются с графом. Здесь — состояние сеанса.

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import {
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
  calcsOf,
  nodeIdsFor,
  STATUS_TEXT,
  type BalanceUnit,
  type BalanceView,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";

export interface BalanceSelection {
  transformationId: string;
  basisId: string | null;
  targetId: string | null;
}

export interface BalanceDraft {
  /** Количество строкой: так поле можно очистить и вписать заново. */
  amount: string;
  unit: BalanceUnit;
  /** Чьё количество: P1 — исходного продукта, P2 — целевого. */
  ref: "P1" | "P2";
  knownData: string;
}

export interface BalanceJobState {
  status: "starting" | "running" | "failed";
  jobId: string | null;
  startedAt: string;
  basisId: string;
  targetId: string;
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
  /** Расчёт, открытый во вкладке: его числа — на узлах. */
  active: { nodeId: string; recordId: number } | null;
  draft: BalanceDraft;
  /** Правленый промпт; null — как на сервере по умолчанию. */
  prompt: { system: string | null; template: string | null };
  defaults: { system: string; template: string } | null;
  /** Идущие и упавшие расчёты — по преобразованию. */
  jobs: Record<string, BalanceJobState>;
  /** Подсказки базы — по паре «преобразование|исходный|целевой». */
  lookups: Record<string, BalanceLookupState>;
}

const initialState: MaterialBalanceState = {
  mode: false,
  selection: null,
  active: null,
  draft: { amount: "1", unit: "т", ref: "P1", knownData: "" },
  prompt: { system: null, template: null },
  defaults: null,
  jobs: {},
  lookups: {},
};

export const lookupKey = (
  transformationId: string,
  basisId: string,
  targetId: string,
) => `${transformationId}|${basisId}|${targetId}`;

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
    arg: { transformationId: string; basisId: string; targetId: string },
    { getState },
  ) => {
    const { nodes } = (getState() as RootState).graph.data;
    const byId = (id: string) => nodes.find((n) => n.id === id);
    return lookupBalance({
      transformation: labelOf(byId(arg.transformationId)),
      basis: labelOf(byId(arg.basisId)),
      target: labelOf(byId(arg.targetId)),
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
    },
    setBalancePair(
      state,
      action: PayloadAction<{ basisId?: string; targetId?: string }>,
    ) {
      if (!state.selection) return;
      if (action.payload.basisId) state.selection.basisId = action.payload.basisId;
      if (action.payload.targetId) state.selection.targetId = action.payload.targetId;
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
        transformationId: string;
        basisId: string;
        targetId: string;
        startedAt: string;
      }>,
    ) {
      const { transformationId, ...rest } = action.payload;
      state.jobs[transformationId] = { status: "starting", jobId: null, ...rest };
    },
    jobRunning(
      state,
      action: PayloadAction<{ transformationId: string; jobId: string; startedAt: string }>,
    ) {
      const job = state.jobs[action.payload.transformationId];
      if (!job) return;
      job.status = "running";
      job.jobId = action.payload.jobId;
      job.startedAt = action.payload.startedAt || job.startedAt;
    },
    /** Расчёт закончился: удачный — задача уходит, неудачный — остаётся с ошибкой. */
    jobEnded(
      state,
      action: PayloadAction<{ transformationId: string; error?: string }>,
    ) {
      const { transformationId, error } = action.payload;
      const job = state.jobs[transformationId];
      if (!job) return;
      if (error) {
        job.status = "failed";
        job.error = error;
      } else {
        delete state.jobs[transformationId];
      }
    },
    dismissBalanceJob(state, action: PayloadAction<string>) {
      delete state.jobs[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBalancePrompt.fulfilled, (state, action) => {
        state.defaults = action.payload;
      })
      .addCase(lookupBalanceFor.pending, (state, action) => {
        const a = action.meta.arg;
        state.lookups[lookupKey(a.transformationId, a.basisId, a.targetId)] = {
          status: "loading",
          exact: null,
          similar: [],
        };
      })
      .addCase(lookupBalanceFor.fulfilled, (state, action) => {
        const a = action.meta.arg;
        state.lookups[lookupKey(a.transformationId, a.basisId, a.targetId)] = {
          status: "done",
          ...action.payload,
        };
      })
      .addCase(lookupBalanceFor.rejected, (state, action) => {
        const a = action.meta.arg;
        state.lookups[lookupKey(a.transformationId, a.basisId, a.targetId)] = {
          status: "failed",
          exact: null,
          similar: [],
        };
      });
  },
});

export const {
  setBalanceMode,
  selectBalanceTransformation,
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

/** Количество из поля: «1,5» и «1.5» — одно и то же; пусто и ноль — 1. */
export function draftAmount(text: string): number {
  const v = Number(String(text).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** Положить расчёт в узел преобразования; повтор той же записи заменяет её. */
function attachCalc(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: {
    transformationId: string;
    record: BalanceRecord;
    basisId: string;
    targetId: string;
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
      basisId: args.basisId,
      targetId: args.targetId,
      ins,
      outs,
    }),
    ...(args.fromCache ? { fromCache: true } : {}),
    addedAt: new Date().toISOString(),
    view: args.view,
  };
  const rest = calcsOf(node).filter((c) => c.record.id !== args.record.id);
  dispatch(
    updateNodeData({ nodeId: node.id, data: { materialBalances: [calc, ...rest] } }),
  );
  dispatch(setBalanceActive({ nodeId: node.id, recordId: args.record.id }));
  return true;
}

/**
 * Рассчитать баланс выбранного преобразования.
 *
 * Обычный запрос сервер может закрыть готовым расчётом из базы — тогда
 * ответ сразу. Иначе расчёт идёт в фоне, а мы спрашиваем ход, пока он не
 * кончится. Граф за это время могли сменить: тогда в новый граф ничего не
 * кладём — ответ уже в базе сервера, и на том же преобразовании
 * «Рассчитать» возьмёт его сразу.
 */
export const runMaterialBalance =
  (opts: { force?: boolean } = {}) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState();
    const sel = state.materialBalance.selection;
    if (!sel?.basisId || !sel.targetId) return;
    const { nodes, edges } = state.graph.data;
    const byId = (id: string) => nodes.find((n) => n.id === id);
    const t = byId(sel.transformationId);
    const basis = byId(sel.basisId);
    const target = byId(sel.targetId);
    if (!t || !basis || !target) return;
    // Расчёт этого преобразования уже идёт или запускается — второй щелчок
    // не запускает второй.
    const current = state.materialBalance.jobs[t.id]?.status;
    if (current === "running" || current === "starting") return;

    const { ins, outs } = balanceEnds(t.id, nodes, edges);
    const { draft, prompt } = state.materialBalance;
    const view: BalanceView = {
      amount: draftAmount(draft.amount),
      unit: draft.unit,
      ref: draft.ref,
    };
    const tLabel = labelOf(t);
    const pairText = `${labelOf(basis)} → ${labelOf(target)}`;
    const canvas = getNotificationCanvas();
    const nodeTarget = { nodeId: t.id, label: tLabel };

    dispatch(
      jobStarted({
        transformationId: t.id,
        basisId: basis.id,
        targetId: target.id,
        startedAt: new Date().toISOString(),
      }),
    );

    const fail = (message: string) => {
      dispatch(jobEnded({ transformationId: t.id, error: message }));
      showToast("error", `Материальный баланс не рассчитан: «${tLabel}»`, message, {
        canvas,
        target: nodeTarget,
      });
    };

    const finish = (record: BalanceRecord, fromCache: boolean) => {
      dispatch(jobEnded({ transformationId: t.id }));
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
        basisId: basis.id,
        targetId: target.id,
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
      // Готовое из базы приходит сразу — человек и так смотрит на плашку.
      if (!fromCache) {
        showToast(
          record.status === "calculated" || record.status === "partial" ? "success" : "info",
          `Материальный баланс: «${tLabel}»`,
          `${pairText} · ${STATUS_TEXT[record.status]}`,
          { canvas, target: nodeTarget },
        );
      }
    };

    let started;
    try {
      started = await startBalance({
        transformation: nodeRef(t),
        basis: nodeRef(basis),
        target: nodeRef(target),
        inputs: ins.map(nodeRef),
        outputs: outs.map(nodeRef),
        ...(draft.knownData.trim() ? { knownData: draft.knownData.trim() } : {}),
        ...(prompt.system ? { system: prompt.system } : {}),
        ...(prompt.template ? { template: prompt.template } : {}),
        ...getAiRequestFields({ stage: "search" }),
        ...(opts.force ? { force: true } : {}),
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return;
    }

    if (started.fromCache) {
      finish(started.result, true);
      return;
    }

    dispatch(
      jobRunning({
        transformationId: t.id,
        jobId: started.jobId,
        startedAt: started.startedAt,
      }),
    );

    let misses = 0;
    for (;;) {
      await sleep(POLL_MS);
      let job;
      try {
        job = await fetchBalanceJob(started.jobId);
        misses = 0;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Сервер перезапускался — задачи больше нет, ждать нечего.
        if (/не найден/i.test(message) || ++misses >= MAX_POLL_MISSES) {
          fail(message);
          return;
        }
        continue;
      }
      if (job.status === "running") continue;
      if (job.status === "failed" || !job.result) {
        fail(job.error || "Расчёт завершился без ответа");
        return;
      }
      finish(job.result, false);
      return;
    }
  };

/** Взять готовый расчёт из базы — из подсказки «есть расчёт по технологии …». */
export const takeBalanceFromBase =
  (recordId: number) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const sel = getState().materialBalance.selection;
    if (!sel?.basisId || !sel.targetId) return;
    const draft = getState().materialBalance.draft;
    try {
      const record = await fetchBalanceRecord(recordId);
      attachCalc(dispatch, getState, {
        transformationId: sel.transformationId,
        record,
        basisId: sel.basisId,
        targetId: sel.targetId,
        fromCache: true,
        view: { amount: draftAmount(draft.amount), unit: draft.unit, ref: draft.ref },
      });
    } catch (e) {
      showToast(
        "error",
        "Не удалось взять расчёт из базы",
        e instanceof Error ? e.message : String(e),
      );
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

/** Сменить базис показа расчёта: количество, единицу или продукт. */
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
