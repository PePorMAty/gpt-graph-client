import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type { ProductCardResponse } from "../types";
import { getAiRequestFields } from "../../hooks/useAiConfig";

export const fetchProductCard = createAsyncThunk<
  { nodeId: string; data: ProductCardResponse },
  { nodeId: string; customSystemPrompt?: string; selectedFields?: string[]; useWebSearch?: boolean },
  { state: RootState; rejectValue: string }
>("graph/fetchProductCard", async ({ nodeId, customSystemPrompt, selectedFields, useWebSearch }, thunkApi) => {
  try {
    const st = thunkApi.getState();

    const node = st.graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return thunkApi.rejectWithValue("node not found");

    // ✅ nodeType для сервера
    const nodeType =
      node.type === "transformation" ? "transformation" : "product";

    // ✅ productName как контекст (можно root цепочки, можно сам node)
    const chainRootId = node.data?.chainRootNodeId;
    const rootNode = chainRootId
      ? st.graph.data.nodes.find((n) => n.id === chainRootId)
      : null;

    const productName = String(
      (rootNode?.data?.label ?? node.data?.label) || "",
    ).trim();

    // ✅ “вся существующая цепочка” — отправляем текущий XYFlow граф
    const chain = {
      nodes: st.graph.data.nodes,
      edges: st.graph.data.edges,
    };

    // ✅ выбранный узел тоже отправляем
    const nodePayload = {
      id: node.id,
      type: node.type,
      data: node.data,
      position: node.position,
    };

    const res = await axios.post<ProductCardResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/fill-card`,
      {
        ...getAiRequestFields(),
        nodeType,
        productName,
        node: nodePayload,
        chain,
        ...(customSystemPrompt ? { customSystemPrompt } : {}),
        ...(selectedFields ? { selectedFields } : {}),
        ...(useWebSearch ? { useWebSearch: true } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !res.data?.productCard) {
      return thunkApi.rejectWithValue(
        "fill-card: success=false or missing productCard",
      );
    }

    return { nodeId, data: res.data };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return thunkApi.rejectWithValue(
        err.response?.data?.error || err.message || "fill-card request error",
      );
    }
    return thunkApi.rejectWithValue("fill-card request error");
  }
});
