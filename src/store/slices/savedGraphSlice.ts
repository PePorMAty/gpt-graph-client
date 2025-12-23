import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import type { SavedGraphFile, SavedGraphMeta } from "../types";
import { fetchSavedGraphs, loadSavedGraph } from "../api/saved-graph-api";

interface SavedGraphsState {
  list: SavedGraphMeta[];
  selectedGraph: SavedGraphFile | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: SavedGraphsState = {
  list: [],
  selectedGraph: null,
  isLoading: false,
  error: null,
};

/* =======================
   THUNKS
======================= */

// Получить список сохранённых графов
export const fetchSavedGraphsThunk = createAsyncThunk(
  "savedGraphs/fetchList",
  async () => {
    return await fetchSavedGraphs();
  }
);

// Загрузить конкретный граф
export const loadSavedGraphThunk = createAsyncThunk(
  "savedGraphs/loadOne",
  async (id: string) => {
    return await loadSavedGraph(id);
  }
);

/* =======================
   SLICE
======================= */

const savedGraphsSlice = createSlice({
  name: "savedGraphs",
  initialState,
  reducers: {
    clearSelectedGraph(state) {
      state.selectedGraph = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ---- LIST ----
      .addCase(fetchSavedGraphsThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSavedGraphsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
      })
      .addCase(fetchSavedGraphsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to load saved graphs";
      })

      // ---- LOAD ONE ----
      .addCase(loadSavedGraphThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadSavedGraphThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedGraph = action.payload;
      })
      .addCase(loadSavedGraphThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to load graph";
      });
  },
});

export const { clearSelectedGraph } = savedGraphsSlice.actions;
export default savedGraphsSlice.reducer;
