import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { SavedGraphFile, SavedGraphMeta } from "../types";
import {
  deleteSavedGraph,
  fetchSavedGraphs,
  loadSavedGraph,
} from "../api/saved-graph-api";

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

// Удалить сохранённый граф на сервере и убрать его из списка локально.
export const deleteSavedGraphThunk = createAsyncThunk<
  string, // возвращает id удалённого
  string // принимает id
>("savedGraphs/deleteOne", async (id, { rejectWithValue }) => {
  try {
    await deleteSavedGraph(id);
    return id;
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : "Не удалось удалить граф",
    );
  }
});

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
      })

      // ---- DELETE ----
      .addCase(deleteSavedGraphThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.list = state.list.filter((g) => g.id !== id);
        if (state.selectedGraph && (state.selectedGraph as { id?: string }).id === id) {
          state.selectedGraph = null;
        }
      })
      .addCase(deleteSavedGraphThunk.rejected, (state, action) => {
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось удалить граф";
      });
  },
});

export const { clearSelectedGraph } = savedGraphsSlice.actions;
export default savedGraphsSlice.reducer;
