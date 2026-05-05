// src/store/api/step-chain-api.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type {
  BuildDirection,
  SourcesSearchResponse,
  StepChainApiResponse,
  StepChainApiStep,
  TechnologySource,
} from "../types";
import type { TechChain } from "../../utils/chainToFlow";
import {
  addSourcesToPool,
  clearAcceptedStepAlternatives,
} from "../slices/gptSlice";

export const fetchChainStep = createAsyncThunk<
  { sessionKey: string; response: StepChainApiResponse },
  {
    sessionKey: string;
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    techText: string;
    existingSources?: TechnologySource[];
    customSystemPrompt?: string;
  },
  { state: RootState; rejectValue: string }
>("graph/fetchChainStep", async (args, thunkApi) => {
  try {
    const state = thunkApi.getState().graph;

    const existingProducts = state.data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label || "").trim())
      .filter(Boolean);

    const res = await axios.post<StepChainApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/chain/step`,
      {
        productName: args.productName,
        direction: args.direction,
        techText: args.techText,
        existingProducts,
        ...(args.existingSources?.length
          ? { existingSources: args.existingSources }
          : {}),
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        res.data?.error || "step chain: success=false",
      );
    }

    return { sessionKey: args.sessionKey, response: res.data };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "step chain: request error",
      );
    }
    return thunkApi.rejectWithValue("step chain: request error");
  }
});

export const fetchStepSources = createAsyncThunk<
  { sessionKey: string; sources: TechnologySource[] },
  {
    sessionKey: string;
    productName: string;
    direction: BuildDirection;
    maxItems?: number;
  },
  { rejectValue: string }
>("graph/fetchStepSources", async (args, thunkApi) => {
  try {
    const res = await axios.post<SourcesSearchResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/sources`,
      {
        productName: args.productName,
        maxItems: args.maxItems ?? 5,
        direction: args.direction,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue("sources: server returned success=false");
    }

    return { sessionKey: args.sessionKey, sources: res.data.sources };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error || e.message || "sources: request error",
      );
    }
    return thunkApi.rejectWithValue("sources: request error");
  }
});

// ============================================================
// NEW STEP-BUILD THUNKS (hit dedicated /step/* server routes)
// ============================================================

/**
 * POST /graphs/gpt/step/sources
 * Новый роут, специально для пошагового режима (другой промпт — крупные фрагменты).
 */
export const fetchStepSourcesV2 = createAsyncThunk<
  {
    nodeId: string;
    direction: BuildDirection;
    sources: TechnologySource[];
    product: string;
    maxItems: number;
  },
  {
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    maxItems?: number;
    existingSources?: TechnologySource[];
    customSystemPrompt?: string;
    provider?: string;
    model?: string;
  },
  { state: RootState; rejectValue: string }
>("stepBuild/fetchSources", async (args, thunkApi) => {
  try {
    const res = await axios.post<SourcesSearchResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/sources`,
      {
        productName: args.productName,
        maxItems: args.maxItems ?? 5,
        direction: args.direction,
        ...(args.existingSources?.length
          ? { existingSources: args.existingSources }
          : {}),
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        "step/sources: server returned success=false",
      );
    }

    thunkApi.dispatch(
      addSourcesToPool({
        productName: args.productName,
        direction: args.direction,
        sources: res.data.sources ?? [],
      }),
    );

    return {
      nodeId: args.nodeId,
      direction: args.direction,
      sources: res.data.sources,
      product: res.data.product,
      maxItems: res.data.maxItems,
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error || e.message || "step/sources: request error",
      );
    }
    return thunkApi.rejectWithValue("step/sources: request error");
  }
});

export type StepAggregateApiResponse = {
  success: boolean;
  status?: "ready" | "needs-sources";
  aggregated_markdown?: string | null;
  insufficientProducts?: string[];
  error?: string;
};

/**
 * POST /graphs/gpt/step/aggregate
 * Возвращает markdown ОДНОГО следующего шага или сигнал needs-sources.
 */
export const aggregateStepSources = createAsyncThunk<
  {
    nodeId: string;
    direction: BuildDirection;
    aggregatedText: string | null;
    insufficientProducts: string[];
  },
  {
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    sources: TechnologySource[];
    existingChain: string;
    customSystemPrompt?: string;
    customUserPrompt?: string;
    provider?: string;
    model?: string;
  },
  { state: RootState; rejectValue: string }
>("stepBuild/aggregate", async (args, thunkApi) => {
  try {
    // Список всех product-нод графа: aggregate должен избегать их в качестве
    // НОВЫХ выходов шага (иначе модель повторяет уже построенный продукт).
    const state = thunkApi.getState().graph;
    const existingProducts = state.data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label || "").trim())
      .filter(Boolean);

    const res = await axios.post<StepAggregateApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/aggregate`,
      {
        productName: args.productName,
        direction: args.direction,
        sources: args.sources,
        existingChain: args.existingChain,
        existingProducts,
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
        ...(args.customUserPrompt
          ? { customUserPrompt: args.customUserPrompt }
          : {}),
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        res.data?.error || "step/aggregate: server returned success=false",
      );
    }

    // Новое обобщение → набор альтернатив сменился, ранее принятые indices
    // теперь не относятся к актуальному списку.
    thunkApi.dispatch(
      clearAcceptedStepAlternatives({
        nodeId: args.nodeId,
        direction: args.direction,
      }),
    );

    if (res.data.status === "needs-sources") {
      return {
        nodeId: args.nodeId,
        direction: args.direction,
        aggregatedText: "needs-sources",
        insufficientProducts: res.data.insufficientProducts ?? [],
      };
    }

    return {
      nodeId: args.nodeId,
      direction: args.direction,
      aggregatedText: res.data.aggregated_markdown ?? null,
      insufficientProducts: [],
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return thunkApi.rejectWithValue(
        e.response?.data?.error || e.message || "step/aggregate: request error",
      );
    }
    return thunkApi.rejectWithValue("step/aggregate: request error");
  }
});

export type StepBuildApiResponse = {
  success: boolean;
  step: StepChainApiStep;
  chain?: TechChain;
  sourcesStatus?: "sufficient" | "insufficient";
  insufficientProducts?: string[];
  error?: string;
};

/**
 * POST /graphs/gpt/step/build
 * Строит один следующий шаг. Ответ совместим с `StepChainApiResponse`
 * (поле `step`), чтобы использовать существующий `acceptPendingStep`.
 */
export const buildStep = createAsyncThunk<
  {
    sessionKey: string;
    nodeId: string;
    direction: BuildDirection;
    step: StepChainApiStep;
    chain: TechChain | null;
    sourcesStatus: "sufficient" | "insufficient";
    insufficientProducts: string[];
  },
  {
    sessionKey: string;
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    techText: string;
    existingSources?: TechnologySource[];
    customSystemPrompt?: string;
    provider?: string;
    model?: string;
  },
  { state: RootState; rejectValue: string }
>("stepBuild/build", async (args, thunkApi) => {
  try {
    const state = thunkApi.getState().graph;

    const existingProducts = state.data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label || "").trim())
      .filter(Boolean);

    const res = await axios.post<StepBuildApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/build`,
      {
        productName: args.productName,
        direction: args.direction,
        techText: args.techText,
        existingProducts,
        ...(args.existingSources?.length
          ? { existingSources: args.existingSources }
          : {}),
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        res.data?.error || "step/build: server returned success=false",
      );
    }

    return {
      sessionKey: args.sessionKey,
      nodeId: args.nodeId,
      direction: args.direction,
      step: res.data.step,
      chain: res.data.chain ?? null,
      sourcesStatus: res.data.sourcesStatus ?? "sufficient",
      insufficientProducts: res.data.insufficientProducts ?? [],
    };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "string" ? errObj : errObj?.message) ||
          e.message ||
          "step/build: request error",
      );
    }
    return thunkApi.rejectWithValue("step/build: request error");
  }
});
