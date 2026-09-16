import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { HistoryEntry, HistoryKind } from "../types";

export type { HistoryEntry, HistoryKind };

/**
 * Сколько записей храним. Дальше история только мешает искать нужное.
 * Совпадает с лимитом на сервере — иначе список после перезагрузки страницы
 * оказался бы короче или длиннее, чем был.
 */
const LIMIT = 300;

interface HistoryState {
  entries: HistoryEntry[];
}

const initialState: HistoryState = { entries: [] };

let seq = 0;

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    /** Записать действие. Самые свежие — в начале списка. */
    pushHistory: {
      reducer(state, action: PayloadAction<HistoryEntry>) {
        state.entries.unshift(action.payload);
        if (state.entries.length > LIMIT) state.entries.length = LIMIT;
      },
      prepare(entry: Omit<HistoryEntry, "id" | "at">) {
        seq += 1;
        return {
          payload: {
            ...entry,
            id: `h-${Date.now().toString(36)}-${seq}`,
            at: new Date().toISOString(),
          },
        };
      },
    },
    clearHistory(state) {
      state.entries = [];
    },
    /** Поднять историю из автосейва при перезагрузке вкладки. */
    restoreHistory(state, action: PayloadAction<HistoryEntry[]>) {
      state.entries = action.payload.slice(0, LIMIT);
    },
  },
});

export const { pushHistory, clearHistory, restoreHistory } =
  historySlice.actions;
export default historySlice.reducer;
