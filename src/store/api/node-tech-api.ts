import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { NodeTechResponse } from "../types";

export const fetchNodeTech = createAsyncThunk<
  { nodeId: string; data: NodeTechResponse },
  { nodeId: string; label: string }
>("graph/fetchNodeTech", async ({ nodeId, label }, { rejectWithValue }) => {
  try {
    const res = await axios.post<NodeTechResponse>(
      `${import.meta.env.VITE_API_URL}/graphs/gpt/sources`,
      { productName: label.trim(), maxItems: 5 },
      { headers: { "Content-Type": "application/json" } },
    );

    return { nodeId, data: res.data };
  } catch (e: any) {
    return rejectWithValue(e.response?.data?.error || "Node tech error");
  }
});
