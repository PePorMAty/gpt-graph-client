import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type { ProductCardResponse } from "../types";

export const fetchProductCard = createAsyncThunk<
  { nodeId: string; data: ProductCardResponse },
  { nodeId: string; customSystemPrompt?: string },
  { state: RootState; rejectValue: string }
>("graph/fetchProductCard", async ({ nodeId, customSystemPrompt }, thunkApi) => {
  try {
    const st = thunkApi.getState();

    const node = st.graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return thunkApi.rejectWithValue("node not found");

    // ✅ nodeType для сервера
    const nodeType =
      node.type === "transformation" ? "transformation" : "product";

    // ✅ productName как контекст (можно root цепочки, можно сам node)
    const chainRootId = (node.data as any)?.chainRootNodeId as
      | string
      | undefined;
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
        nodeType,
        productName,
        node: nodePayload,
        chain,
        ...(customSystemPrompt ? { customSystemPrompt } : {}),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !res.data?.productCard) {
      return thunkApi.rejectWithValue(
        "fill-card: success=false or missing productCard",
      );
    }

    return { nodeId, data: res.data };
  } catch (e: any) {
    return thunkApi.rejectWithValue(
      e?.response?.data?.error || e?.message || "fill-card request error",
    );
  }
});
