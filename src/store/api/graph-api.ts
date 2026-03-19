import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import { buildLevelFromRawChain } from "../../utils/rawChainLevel";
import { levelToFlow } from "../../utils/levelToFlow";

import type { RootState } from "../store";

import type { CustomNode, GPTGraphResponse } from "../../types";
import type {
  CreateGraphArgs,
  CreateGraphResult,
  GraphApiResponse,
} from "../types";
import { type TechChain } from "../../utils/chainToFlow";
import type { Edge } from "@xyflow/react";
import { popQueueHead } from "../slices/gptSlice";

export const getGraphData = createAsyncThunk<
  CreateGraphResult,
  CreateGraphArgs
>(
  "graph/getGraphData",
  async ({ promptValue, promptLayout }, { rejectWithValue }) => {
    try {
      const response = await axios.post<GraphApiResponse>(
        `${import.meta.env.VITE_API_URL}/graphs/gpt`,
        {
          userPrompt: promptValue,
          promptLayout,
        },
      );
      return {
        data: response.data,
        message: response.data.message || "Граф создан",
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        return rejectWithValue(
          error.response?.data?.error || error.message || "Ошибка сети",
        );
      }
      return rejectWithValue("Неизвестная ошибка");
    }
  },
);

export const getPromptLayoutFromServer = async (): Promise<string> => {
  const response = await axios.get<{ promptLayout: string }>(
    `${import.meta.env.VITE_API_URL}/graphs/prompt-layout`,
  );
  return response.data.promptLayout;
};

export const continueGraph = createAsyncThunk<
  GPTGraphResponse, // <— тип ответа
  { selectedLeafNodes: string[] }, // <— тип аргументов
  { state: RootState } // <— тип getState()
>(
  "graph/continueGraph",
  async ({ selectedLeafNodes }, { getState, rejectWithValue }) => {
    const state = getState().graph;

    try {
      const response = await axios.post<GPTGraphResponse>(
        `${import.meta.env.VITE_API_URL}/graphs/gpt/continue`,
        {
          originalPrompt: state.originalPrompt,
          existingGraph: state.data,
          leafNodes: selectedLeafNodes,
        },
      );

      return response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data || "Continue graph error");
      }
      return rejectWithValue("Continue graph error");
    }
  },
);

type ChainApiResponse = {
  success: boolean;
  product: string;
  chain: TechChain;
  level1?: {
    targetPid: string;
    transformationId: string;
    inputPids: string[];
    chain: TechChain;
  };
  error?: { error?: { message?: string } } | string;
};

export const buildChainLevel1 = createAsyncThunk<
  { nodeId: string; raw: ChainApiResponse },
  { nodeId: string; productName: string; techText: string },
  { state: RootState; rejectValue: string }
>("graph/buildChainLevel1", async (args, thunkApi) => {
  try {
    const { nodeId, productName, techText } = args;

    const res = await axios.post<ChainApiResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/chain`,
      { productName, techText, targetProductId: "Продукт1" },
      { headers: { "Content-Type": "application/json" } },
    );

    const data = res.data;
    if (!data?.success) {
      const errObj = data?.error;
      let msg = "gpt/chain: success=false";
      if (typeof errObj === "string") {
        msg = errObj;
      } else if (typeof errObj === "object" && errObj?.error?.message) {
        msg = errObj.error.message;
      }
      return thunkApi.rejectWithValue(msg);
    }
    if (!data.chain?.Цепочка?.length) {
      return thunkApi.rejectWithValue("gpt/chain: missing chain.Цепочка");
    }

    // ✅ НИЧЕГО НЕ РИСУЕМ, просто сохраняем rawChain в session (в reducer)
    return { nodeId, raw: data };
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const errObj = e.response?.data?.error;
      return thunkApi.rejectWithValue(
        (typeof errObj === "object" && errObj?.error?.message) ||
          errObj ||
          e.message ||
          "gpt/chain: request error",
      );
    }
    return thunkApi.rejectWithValue("gpt/chain: request error");
  }
});

// раскрыть 1 уровень для выбранной product-ноды (без запросов)
export const expandChainOneLevel = createAsyncThunk<
  {
    rootNodeId: string;
    targetNodeId: string;
    nodes: CustomNode[];
    edges: Edge[];
    pidToNodeIdNext: Record<string, string>;
    nextPids: string[];
    usedTrId: string;
  },
  { targetNodeId: string },
  { state: RootState; rejectValue: string }
>("graph/expandChainOneLevel", async ({ targetNodeId }, thunkApi) => {
  const state = thunkApi.getState().graph;
  const rootNodeId = state.chainSession.rootNodeId;
  const rawChain = state.chainSession.rawChain;

  if (!rootNodeId || !rawChain) {
    return thunkApi.rejectWithValue("chain session is not started");
  }

  const anchor = state.data.nodes.find((n) => n.id === targetNodeId);
  const ax = anchor?.position?.x ?? 0;
  const ay = anchor?.position?.y ?? 0;

  const targetPid =
    anchor?.data?.chainPid || (targetNodeId === rootNodeId ? "Продукт1" : null);

  if (!targetPid) {
    return thunkApi.rejectWithValue("missing chainPid on target node");
  }

  const lvl = buildLevelFromRawChain(rawChain, targetPid, undefined);

  if (!lvl.ok) {
    return thunkApi.rejectWithValue("no producer for this pid (raw material?)");
  }

  const usedTrId = lvl.transformationId;

  // ✅ блокируем только (pid + конкретный producer)
  const built = state.chainSession.expandedProducerByPid?.[targetPid] || [];
  if (built.includes(usedTrId)) {
    return thunkApi.rejectWithValue("already expanded");
  }

  // ✅ направление — ТОЛЬКО из session (иначе будет up/down прыгать)
  const dir = state.chainSession.direction ?? "down";

  const lvlPrefix = `chain::${rootNodeId}::lvl::${targetPid}::${usedTrId}`;

  const { nodes, edges, pidToNodeIdNext } = levelToFlow(lvl.chain, {
    namespace: lvlPrefix,
    rootNodeId,
    targetNodeId,
    targetPid,
    targetX: ax,
    targetY: ay,
    direction: dir,
    pidToNodeId: state.chainSession.pidToNodeId,
  });

  const nextPids = Array.from(new Set(lvl.inputPids)).filter(
    (p) => p !== targetPid,
  );

  return {
    rootNodeId,
    targetNodeId,
    nodes,
    edges,
    pidToNodeIdNext,
    nextPids,
    usedTrId,
  };
});

export const expandNextInQueue = createAsyncThunk<
  void,
  void,
  { state: RootState; rejectValue: string }
>("graph/expandNextInQueue", async (_, thunkApi) => {
  const getSt = () => thunkApi.getState().graph;

  let st = getSt();
  const rootNodeId = st.chainSession.rootNodeId;
  const rawChain = st.chainSession.rawChain;
  if (!rootNodeId || !rawChain) {
    return thunkApi.rejectWithValue("no chain session");
  }

  // защитный лимит, чтобы не зациклиться
  for (let guard = 0; guard < 50; guard++) {
    st = getSt();
    const queue = st.chainSession.queue || [];
    if (!queue.length) return;

    const pid = queue[0].pid;

    const probe = buildLevelFromRawChain(rawChain, pid, undefined);
    if (!probe.ok) {
      thunkApi.dispatch(popQueueHead());
      continue;
    }

    const targetNodeId =
      st.chainSession.pidToNodeId?.[pid] ||
      (pid === "Продукт1" ? rootNodeId : null);

    if (!targetNodeId) {
      // на всякий — если nodeId не найден, тоже пропускаем
      thunkApi.dispatch(popQueueHead());
      continue;
    }

    await thunkApi.dispatch(expandChainOneLevel({ targetNodeId })).unwrap();
    return;
  }

  return thunkApi.rejectWithValue("queue guard exceeded");
});
