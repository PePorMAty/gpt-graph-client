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
import { addSourcesToPool, sourcesPoolKey } from "../slices/gptSlice";
import { getAncestorProductLabels } from "../../utils/graphReachability";

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
    exhausted: boolean;
  },
  {
    nodeId: string;
    productName: string;
    direction: BuildDirection;
    maxItems?: number;
    existingSources?: TechnologySource[];
    customSystemPrompt?: string;
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
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        "step/sources: server returned success=false",
      );
    }

    const exhausted = !!res.data.exhausted;
    // Явный поиск ВСЕГДА присваивает источники продукту (делает их «родными»),
    // даже если нового не нашлось — иначе свежие источники «не кладутся» в продукт.
    thunkApi.dispatch(
      addSourcesToPool({
        productName: args.productName,
        direction: args.direction,
        sources: res.data.sources ?? [],
      }),
    );
    if (exhausted) {
      // #4: источники повторяются (добор не дал нового) → не ждём ручного клика
      // «Обобщить». НО не зацикливаемся (см. blocked ниже).
      const graph = thunkApi.getState().graph;
      const srcState =
        thunkApi.getState().sources.byNodeId[
          `${args.nodeId}::${args.direction}`
        ];
      // Не зацикливаемся: если продукт уже в needs-sources (прошлое обобщение
      // не сложилось) или обобщение уже идёт — не запускаем авто-ретрай
      // тяжёлого вызова (иначе петля и «зависание»).
      const blocked =
        srcState?.stepAggregateStatus === "loading" ||
        !!srcState?.stepNeedsSources;
      const poolSources =
        graph.sourcesPool[sourcesPoolKey(args.productName, args.direction)]
          ?.sources ?? [];
      if (poolSources.length && !blocked) {
        const node = graph.data.nodes.find((n) => n.id === args.nodeId);
        const nodeData = (node?.data ?? {}) as Record<string, unknown>;
        const descField =
          args.direction === "up" ? "upDescription" : "downDescription";
        const existingChain = String(
          nodeData[descField] ?? nodeData.description ?? "",
        ).trim();
        thunkApi.dispatch(
          aggregateStepSources({
            nodeId: args.nodeId,
            productName: args.productName,
            direction: args.direction,
            sources: poolSources,
            existingChain,
          }),
        );
      }
    }

    return {
      nodeId: args.nodeId,
      direction: args.direction,
      sources: res.data.sources,
      product: res.data.product,
      maxItems: res.data.maxItems,
      exhausted,
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

    // Родословная раскрываемого продукта (предки по цепочке + он сам) — чтобы
    // обобщение НЕ выбрало следующим продуктом предка (это замкнуло бы петлю).
    const ancestorProducts = Array.from(
      new Set(
        [
          args.productName,
          ...getAncestorProductLabels(
            args.nodeId,
            state.data.nodes,
            state.data.edges,
          ),
        ]
          .map((s) => String(s || "").trim())
          .filter(Boolean),
      ),
    );

    const res = await axios.post<StepAggregateApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/aggregate`,
      {
        productName: args.productName,
        direction: args.direction,
        sources: args.sources,
        existingChain: args.existingChain,
        existingProducts,
        ancestorProducts,
        ...(args.customSystemPrompt
          ? { customSystemPrompt: args.customSystemPrompt }
          : {}),
        ...(args.customUserPrompt
          ? { customUserPrompt: args.customUserPrompt }
          : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success) {
      return thunkApi.rejectWithValue(
        res.data?.error || "step/aggregate: server returned success=false",
      );
    }

    // Принятые альтернативы при новом обобщении НЕ сбрасываем: они помечены
    // ключом СОДЕРЖИМОГО (alternativeKey), а не индексом. Если новое обобщение
    // вернёт ту же альтернативу — она уже материализована на полотне, и
    // пересоздавать её alt-ноду было бы дублем; новые альтернативы под
    // старые ключи не попадают.

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
  },
  { state: RootState; rejectValue: string }
>("stepBuild/build", async (args, thunkApi) => {
  try {
    const state = thunkApi.getState().graph;

    const existingProducts = state.data.nodes
      .filter((n) => n.type === "product")
      .map((n) => String(n.data?.label || "").trim())
      .filter(Boolean);

    // Родословная раскрываемого продукта (предки по цепочке + он сам). Сервер
    // использует её в проверке достаточности: следующий передел нового ребёнка
    // не должен вести ОБРАТНО к предку (иначе это замкнёт цикл, и ребёнку нужны
    // свежие источники для НОВОГО направления).
    const ancestorProducts = Array.from(
      new Set(
        [
          args.productName,
          ...getAncestorProductLabels(
            args.nodeId,
            state.data.nodes,
            state.data.edges,
          ),
        ]
          .map((s) => String(s || "").trim())
          .filter(Boolean),
      ),
    );

    const res = await axios.post<StepBuildApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/step/build`,
      {
        productName: args.productName,
        direction: args.direction,
        techText: args.techText,
        existingProducts,
        ancestorProducts,
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
