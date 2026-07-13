import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { SavedGraphFile, SavedGraphMeta, SaveGraphPayload } from "../types";
import {
  deleteSavedGraph,
  fetchSavedGraphs,
  loadSavedGraph,
  renameSavedGraph,
  updateSavedGraph,
} from "../api/saved-graph-api";
import { getGraphData } from "../api/graph-api";

interface SavedGraphsState {
  list: SavedGraphMeta[];
  selectedGraph: SavedGraphFile | null;
  isLoading: boolean;
  error: string | null;
  /** id (имя файла) сохранённого графа, который сейчас открыт на полотне (для «Обновить»). */
  openedGraphId: string | null;
  /** Имя открытого сохранённого графа — для подписи кнопки «Обновить «имя»». */
  openedGraphName: string | null;
}

const initialState: SavedGraphsState = {
  list: [],
  selectedGraph: null,
  isLoading: false,
  error: null,
  openedGraphId: null,
  openedGraphName: null,
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

// Обновить (перезаписать) уже сохранённый граф — тот же файл.
export const updateSavedGraphThunk = createAsyncThunk<
  SavedGraphMeta,
  { id: string; payload: SaveGraphPayload }
>("savedGraphs/updateOne", async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await updateSavedGraph(id, payload);
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : "Не удалось обновить граф",
    );
  }
});

// Переименовать сохранённый граф (id стабилен).
export const renameSavedGraphThunk = createAsyncThunk<
  SavedGraphMeta,
  { id: string; name: string }
>("savedGraphs/renameOne", async ({ id, name }, { rejectWithValue }) => {
  try {
    return await renameSavedGraph(id, name);
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : "Не удалось переименовать граф",
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
    // Запомнить, какой сохранённый файл сейчас открыт на полотне (для «Обновить»).
    setOpenedGraph(
      state,
      action: { payload: { id: string; name: string } },
    ) {
      state.openedGraphId = action.payload.id;
      state.openedGraphName = action.payload.name;
    },
    // Сбросить привязку к сохранённому файлу (новый граф / загрузка из файла /
    // очистка полотна / частичное открытие подграфа).
    clearOpenedGraph(state) {
      state.openedGraphId = null;
      state.openedGraphName = null;
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
        if (state.openedGraphId === id) {
          state.openedGraphId = null;
          state.openedGraphName = null;
        }
      })
      .addCase(deleteSavedGraphThunk.rejected, (state, action) => {
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось удалить граф";
      })

      // ---- UPDATE (перезапись содержимого) ----
      .addCase(updateSavedGraphThunk.fulfilled, (state, action) => {
        const meta = action.payload;
        state.list = state.list.map((g) => (g.id === meta.id ? meta : g));
      })
      .addCase(updateSavedGraphThunk.rejected, (state, action) => {
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось обновить граф";
      })

      // ---- RENAME ----
      .addCase(renameSavedGraphThunk.fulfilled, (state, action) => {
        const meta = action.payload;
        state.list = state.list.map((g) => (g.id === meta.id ? meta : g));
        if (state.openedGraphId === meta.id) {
          state.openedGraphName = meta.name;
        }
      })
      .addCase(renameSavedGraphThunk.rejected, (state, action) => {
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось переименовать граф";
      })

      // Новый граф из промпта — больше не привязаны к сохранённому файлу.
      .addCase(getGraphData.fulfilled, (state) => {
        state.openedGraphId = null;
        state.openedGraphName = null;
      });
  },
});

export const { clearSelectedGraph, setOpenedGraph, clearOpenedGraph } =
  savedGraphsSlice.actions;
export default savedGraphsSlice.reducer;
