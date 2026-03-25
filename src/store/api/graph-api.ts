import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import { buildLevelFromRawChain } from "../../utils/rawChainLevel";
import { levelToFlow } from "../../utils/levelToFlow";
import { computeShiftX } from "../../utils/resolveChainOverlap";

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
  { nodeId: string; raw: ChainApiResponse; techText: string },
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
    // techText передаём дальше для парсинга альтернатив в reducer
    return { nodeId, raw: data, techText };
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

  const anchor = state.data.nodes.find((n) => n.id === targetNodeId);
  const rootNodeId =
    (anchor?.data?.chainRootNodeId as string) ||
    (Object.keys(state.chainSessions).includes(targetNodeId)
      ? targetNodeId
      : null);

  if (!rootNodeId) {
    return thunkApi.rejectWithValue("chain session is not started");
  }

  const session = state.chainSessions[rootNodeId];
  if (!session?.rawChain) {
    return thunkApi.rejectWithValue("chain session is not started");
  }

  const rootX = session.rootX ?? (anchor?.position?.x ?? 0);
  const ay = anchor?.position?.y ?? 0;

  const targetPid =
    anchor?.data?.chainPid || (targetNodeId === rootNodeId ? "Продукт1" : null);

  if (!targetPid) {
    return thunkApi.rejectWithValue("missing chainPid on target node");
  }

  // ✅ направление — ТОЛЬКО из session (иначе будет up/down прыгать)
  const dir = session.direction ?? "down";

  // собираем ВСЕ уже использованные Id преобразований (из любого pid)
  const allUsedTrIds = Object.values(session.expandedProducerByPid).flat();

  const lvl = buildLevelFromRawChain(session.rawChain, targetPid, undefined, dir, allUsedTrIds, session.mainTrIds);

  if (!lvl.ok) {
    return thunkApi.rejectWithValue("no producer for this pid (raw material?)");
  }

  const usedTrId = lvl.transformationId;

  // ✅ блокируем только (pid + конкретный producer)
  const built = session.expandedProducerByPid?.[targetPid] || [];
  if (built.includes(usedTrId)) {
    return thunkApi.rejectWithValue("already expanded");
  }

  const lvlPrefix = `chain::${rootNodeId}::lvl::${targetPid}::${usedTrId}`;

  const { nodes, edges, pidToNodeIdNext } = levelToFlow(lvl.chain, {
    namespace: lvlPrefix,
    rootNodeId,
    targetNodeId,
    targetPid,
    targetX: rootX,
    targetY: ay,
    direction: dir,
    pidToNodeId: session.pidToNodeId,
  });

  // ✅ коллизии: сдвигаем новые ноды если пересекаются с существующими
  const existingNodes = state.data.nodes.filter(
    (n) => !nodes.some((newN) => newN.id === n.id),
  );
  const dx = computeShiftX(nodes, existingNodes);
  if (dx !== 0) {
    for (const n of nodes) {
      n.position = { x: n.position.x + dx, y: n.position.y };
    }
  }

  // все продукты текущего преобразования (входы + выходы) могут иметь свои преобразования
  const nextPids = Array.from(
    new Set([...lvl.inputPids, ...lvl.outputPids]),
  ).filter((p) => p !== targetPid);

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
  { rootNodeId: string },
  { state: RootState; rejectValue: string }
>("graph/expandNextInQueue", async ({ rootNodeId }, thunkApi) => {
  const getSt = () => thunkApi.getState().graph;

  let st = getSt();
  const session = st.chainSessions[rootNodeId];
  if (!session?.rawChain) {
    return thunkApi.rejectWithValue("no chain session");
  }

  const rawChain = session.rawChain;

  // защитный лимит, чтобы не зациклиться
  for (let guard = 0; guard < 50; guard++) {
    st = getSt();
    const curSession = st.chainSessions[rootNodeId];
    const queue = curSession?.queue || [];
    if (!queue.length) return;

    const pid = queue[0].pid;
    const dir = curSession?.direction ?? "down";

    const allUsedTrIds = Object.values(curSession?.expandedProducerByPid ?? {}).flat();
    const probe = buildLevelFromRawChain(rawChain, pid, undefined, dir, allUsedTrIds, curSession?.mainTrIds);
    if (!probe.ok) {
      thunkApi.dispatch(popQueueHead(rootNodeId));
      continue;
    }

    const targetNodeId =
      curSession?.pidToNodeId?.[pid] ||
      (pid === "Продукт1" ? rootNodeId : null);

    if (!targetNodeId) {
      thunkApi.dispatch(popQueueHead(rootNodeId));
      continue;
    }

    await thunkApi.dispatch(expandChainOneLevel({ targetNodeId })).unwrap();
    return;
  }

  return thunkApi.rejectWithValue("queue guard exceeded");
});
