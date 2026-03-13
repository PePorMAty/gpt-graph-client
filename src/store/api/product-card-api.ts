import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import type { RootState } from "../store";
import type { ProductCardResponse } from "../types";

export const fetchProductCard = createAsyncThunk<
  { nodeId: string; data: ProductCardResponse },
  { nodeId: string },
  { state: RootState; rejectValue: string }
>("graph/fetchProductCard", async ({ nodeId }, thunkApi) => {
  try {
    const st = thunkApi.getState();

    const node = st.graph.data.nodes.find((n) => n.id === nodeId);
    if (!node) return thunkApi.rejectWithValue("node not found");

    // ✅ productName — лучше брать от корня цепочки, если он есть
    const chainRootId = (node.data as any)?.chainRootNodeId as
      | string
      | undefined;
    const rootNode = chainRootId
      ? st.graph.data.nodes.find((n) => n.id === chainRootId)
      : null;

    const productName = String(
      (rootNode?.data?.label ?? node.data?.label) || "",
    ).trim();
    if (!productName) return thunkApi.rejectWithValue("productName is empty");

    // ✅ "вся существующая цепочка" — отправляем rawChain если есть, иначе текущий граф
    const rawText = JSON.stringify(
      st.graph.chainSession.rawChain ?? {
        nodes: st.graph.data.nodes,
        edges: st.graph.data.edges,
      },
      null,
      2,
    );

    const res = await axios.post<ProductCardResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/fill-card`,
      { productName, rawText },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.data?.success || !res.data?.productCard) {
      return thunkApi.rejectWithValue(
        "product-card: success=false or missing productCard",
      );
    }

    return { nodeId, data: res.data };
  } catch (e: any) {
    return thunkApi.rejectWithValue(
      e?.response?.data?.error || e?.message || "product-card request error",
    );
  }
});
