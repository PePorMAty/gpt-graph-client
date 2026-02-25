import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import type { RootState } from "../store";

import type { CustomNode, GPTGraphResponse } from "../../types";
import type {
  CreateGraphArgs,
  CreateGraphResult,
  GraphApiResponse,
} from "../types";
import { chainToFlow, type TechChain } from "../../utils/chainToFlow";
import type { Edge } from "@xyflow/react";

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
  { nodeId: string; nodes: CustomNode[]; edges: Edge[]; raw: ChainApiResponse },
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
    if (!data.level1?.chain?.Цепочка) {
      return thunkApi.rejectWithValue("gpt/chain: missing level1.chain");
    }

    // позиционируем новые узлы рядом с выбранной нодой
    const state = thunkApi.getState().graph;
    const anchor = state.data.nodes.find((n) => n.id === nodeId);
    const ax = anchor?.position?.x ?? 0;
    const ay = anchor?.position?.y ?? 0;

    const namespace = `${nodeId}::chain`;

    const { nodes, edges } = chainToFlow(data.level1.chain, {
      namespace,
      targetNodeId: nodeId, // 👈 используем существующую ноду продукта
      targetPid: "Продукт1",
      baseX: ax + 360,
      baseY: ay,
    });

    return { nodeId, nodes, edges, raw: data };
  } catch (e: any) {
    return thunkApi.rejectWithValue(
      e?.response?.data?.error?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "gpt/chain: request error",
    );
  }
});
