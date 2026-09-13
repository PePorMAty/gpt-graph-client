import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** Смысловая группа записи — от неё зависят иконка и цвет в панели. */
export type HistoryKind =
  | "create"
  | "open"
  | "merge"
  | "add"
  | "remove"
  | "edit"
  | "step"
  | "link"
  | "save"
  | "clear";

export interface HistoryEntry {
  id: string;
  /** Время события (ISO). */
  at: string;
  kind: HistoryKind;
  /** Короткая строка: что произошло. */
  title: string;
  /** Подробности: имена узлов, количества. */
  details?: string;
  /** Узлы, к которым относится запись, — по клику камера едет к ним. */
  nodeIds?: string[];
}

/** Сколько записей храним. Дальше история только мешает искать нужное. */
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
