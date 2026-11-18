import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { SavedGraphFile, SavedGraphMeta, SaveGraphPayload } from "../types";
import {
  deleteSavedGraph,
  fetchSavedGraphs,
  GraphConflictError,
  loadSavedGraph,
  renameSavedGraph,
  saveErrorText,
  updateGraphDescription,
  updateSavedGraph,
} from "../api/saved-graph-api";
import { getGraphData } from "../api/graph-api";

interface SavedGraphsState {
  list: SavedGraphMeta[];
  selectedGraph: SavedGraphFile | null;
  /**
   * id графа, которому принадлежит selectedGraph. В самом файле id нет, а
   * знать его нужно: пока грузится другой граф, в сторе ещё лежит предыдущий,
   * и без этой проверки «Открыть граф» положил бы на полотно не тот файл.
   */
  selectedGraphId: string | null;
  isLoading: boolean;
  error: string | null;
  /** id (имя файла) сохранённого графа, который сейчас открыт на полотне (для «Обновить»). */
  openedGraphId: string | null;
  /** Имя открытого сохранённого графа — для подписи кнопки «Обновить «имя»». */
  openedGraphName: string | null;
  /**
   * Версия открытого графа — с ней граф открыли или последний раз сохранили.
   * Уходит в «Обновить»: граф сохранил кто-то другой — сервер ответит 409.
   * null — сервер без версий или граф ещё не сохраняли: без проверки.
   */
  openedGraphVersion: number | null;
  /**
   * «Обновить» получил 409: граф изменили, пока его правили. Пока не null,
   * показано окно выбора (SaveConflictModal): открыть их версию или сохранить
   * свою копией.
   */
  saveConflict: { id: string; current: SavedGraphMeta } | null;
  /** Время последнего сохранения полотна (ISO) — для строки состояния. */
  savedAt: string | null;
  /**
   * Слепок полотна на момент сохранения. Строка состояния сравнивает его с
   * текущим слепком и по расхождению показывает «изменения не сохранены».
   */
  savedSignature: string | null;
}

const initialState: SavedGraphsState = {
  list: [],
  selectedGraph: null,
  selectedGraphId: null,
  isLoading: false,
  error: null,
  openedGraphId: null,
  openedGraphName: null,
  openedGraphVersion: null,
  saveConflict: null,
  savedAt: null,
  savedSignature: null,
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

// Обновить (перезаписать) уже сохранённый граф — тот же файл. Отказ —
// строка с причиной или { conflict } (граф сохранил кто-то другой).
export type UpdateGraphRejection = string | { conflict: SavedGraphMeta };

export const updateSavedGraphThunk = createAsyncThunk<
  SavedGraphMeta,
  { id: string; payload: SaveGraphPayload },
  { rejectValue: UpdateGraphRejection }
>("savedGraphs/updateOne", async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await updateSavedGraph(id, payload);
  } catch (e) {
    if (e instanceof GraphConflictError) return rejectWithValue({ conflict: e.current });
    return rejectWithValue(saveErrorText(e));
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

// Изменить описание графа («О графе»). Возвращаем и введённый текст: сервер
// может ответить метой без description, пока поле на бэке не заведено, — тогда
// подставим своё, чтобы правка не пропала с экрана.
export const updateGraphDescriptionThunk = createAsyncThunk<
  { meta: SavedGraphMeta; description: string },
  { id: string; description: string }
>(
  "savedGraphs/updateDescription",
  async ({ id, description }, { rejectWithValue }) => {
    try {
      const meta = await updateGraphDescription(id, description);
      return { meta, description };
    } catch (e) {
      return rejectWithValue(
        e instanceof Error ? e.message : "Не удалось сохранить описание",
      );
    }
  },
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
      state.selectedGraphId = null;
    },
    // Запомнить, какой сохранённый файл сейчас открыт на полотне (для «Обновить»).
    setOpenedGraph(
      state,
      action: { payload: { id: string; name: string; version?: number | null } },
    ) {
      state.openedGraphId = action.payload.id;
      state.openedGraphName = action.payload.name;
      state.openedGraphVersion =
        typeof action.payload.version === "number" ? action.payload.version : null;
      state.saveConflict = null;
    },
    /** Закрыть окно конфликта сохранения (выбор сделан или отменён). */
    clearSaveConflict(state) {
      state.saveConflict = null;
    },
    // Сбросить привязку к сохранённому файлу (новый граф / загрузка из файла /
    // очистка полотна / частичное открытие подграфа).
    clearOpenedGraph(state) {
      state.openedGraphId = null;
      state.openedGraphName = null;
      state.openedGraphVersion = null;
      state.saveConflict = null;
      state.savedAt = null;
      state.savedSignature = null;
    },
    /**
     * Полотно записано (или только что загружено) — запомнить его слепок.
     *
     * Действие шлют по двум поводам: после настоящей записи на сервер и сразу
     * после открытия графа, чтобы строка состояния не показывала «изменения не
     * сохранены» у только что загруженного полотна. Второй случай помечается
     * opened: для истории это не сохранение, и записывать его туда нельзя.
     */
    markGraphSaved(
      state,
      action: { payload: { signature: string; opened?: boolean } },
    ) {
      state.savedAt = new Date().toISOString();
      state.savedSignature = action.payload.signature;
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
      .addCase(loadSavedGraphThunk.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        // Пока грузится новый файл, прежний уже не относится к выбранному графу.
        if (state.selectedGraphId !== action.meta.arg) {
          state.selectedGraphId = null;
        }
      })
      .addCase(loadSavedGraphThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedGraph = action.payload;
        state.selectedGraphId = action.meta.arg;
      })
      .addCase(loadSavedGraphThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to load graph";
      })

      // ---- DELETE ----
      .addCase(deleteSavedGraphThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.list = state.list.filter((g) => g.id !== id);
        if (state.selectedGraphId === id) {
          state.selectedGraph = null;
          state.selectedGraphId = null;
        }
        if (state.openedGraphId === id) {
          state.openedGraphId = null;
          state.openedGraphName = null;
          state.openedGraphVersion = null;
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
        if (state.openedGraphId === meta.id && typeof meta.version === "number") {
          state.openedGraphVersion = meta.version;
        }
      })
      .addCase(updateSavedGraphThunk.rejected, (state, action) => {
        const reason = action.payload;
        if (reason && typeof reason === "object") {
          state.saveConflict = { id: action.meta.arg.id, current: reason.conflict };
          return;
        }
        state.error = reason || action.error.message || "Не удалось обновить граф";
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

      .addCase(updateGraphDescriptionThunk.fulfilled, (state, action) => {
        const { meta, description } = action.payload;
        const merged: SavedGraphMeta = { ...meta, description };
        state.list = state.list.map((g) => (g.id === merged.id ? merged : g));
        if (state.selectedGraphId === merged.id && state.selectedGraph) {
          state.selectedGraph.meta.description = description;
        }
      })
      .addCase(updateGraphDescriptionThunk.rejected, (state, action) => {
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось сохранить описание";
      })

      // Новый граф из промпта — больше не привязаны к сохранённому файлу.
      .addCase(getGraphData.fulfilled, (state) => {
        state.openedGraphId = null;
        state.openedGraphName = null;
        state.openedGraphVersion = null;
      });
  },
});

export const {
  clearSelectedGraph,
  setOpenedGraph,
  clearOpenedGraph,
  clearSaveConflict,
  markGraphSaved,
} = savedGraphsSlice.actions;
export default savedGraphsSlice.reducer;
