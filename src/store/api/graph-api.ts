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
import { chainToFlow, type TechChain } from "../../utils/chainToFlow";
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
    } catch (err: any) {
      return rejectWithValue(err.response?.data || "Continue graph error");
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
  error?: any;
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
      return thunkApi.rejectWithValue(
        data?.error?.error?.message ||
          data?.error ||
          "gpt/chain: success=false",
      );
    }
    if (!data.chain?.Цепочка?.length) {
      return thunkApi.rejectWithValue("gpt/chain: missing chain.Цепочка");
    }

    // ✅ НИЧЕГО НЕ РИСУЕМ, просто сохраняем rawChain в session (в reducer)
    return { nodeId, raw: data };
  } catch (e: any) {
    return thunkApi.rejectWithValue(
      e?.response?.data?.error?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "gpt/chain: request error",
    );
  }
});

// store/api/graph-api.ts (кусок внутри expandChainOneLevel)

function findFreeBaseY(
  nodes: any[],
  ax: number,
  ay: number,
  direction: "up" | "down",
  gap: number,
) {
  // смотрим узлы в “полосе” по X рядом с anchor, чтобы не пересекаться с уже нарисованными уровнями
  const xMin = ax - 900;
  const xMax = ax + 500;

  const band = nodes.filter((n) => {
    const x = n?.position?.x;
    const y = n?.position?.y;
    return (
      typeof x === "number" && typeof y === "number" && x >= xMin && x <= xMax
    );
  });

  if (!band.length) {
    return direction === "down" ? ay + gap : ay - gap;
  }

  const ys = band.map((n) => n.position.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return direction === "down"
    ? Math.max(ay + gap, maxY + gap)
    : Math.min(ay - gap, minY - gap);
}

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
    (anchor?.data as any)?.chainPid ||
    (targetNodeId === rootNodeId ? "Продукт1" : null);

  if (!targetPid) {
    return thunkApi.rejectWithValue("missing chainPid on target node");
  }

  const chosenTr = state.chainSession.producerByPid[targetPid]; // может быть undefined
  const lvl = buildLevelFromRawChain(rawChain, targetPid, chosenTr);

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
  for (let i = 0; i < 50; i++) {
    const st = thunkApi.getState().graph;
    const rootNodeId = st.chainSession.rootNodeId;
    if (!rootNodeId) return thunkApi.rejectWithValue("no chain session");

    const next = st.chainSession.queue?.[0];
    if (!next) return; // done

    const pid = next.pid;
    const targetNodeId =
      st.chainSession.pidToNodeId?.[pid] ||
      (pid === "Продукт1" ? rootNodeId : null);

    if (!targetNodeId) {
      thunkApi.dispatch(popQueueHead());
      continue;
    }

    try {
      await thunkApi.dispatch(expandChainOneLevel({ targetNodeId })).unwrap();
      return; // успех
    } catch (e: any) {
      const msg = String(e || "");
      // пропускаем “невозможные” элементы очереди
      if (msg.includes("no producer") || msg.includes("already expanded")) {
        thunkApi.dispatch(popQueueHead());
        continue;
      }
      throw e;
    }
  }
});
