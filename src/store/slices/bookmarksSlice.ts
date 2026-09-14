import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { loadGraphFromFile, setGraphData, removeNodes } from "./gptSlice";
import type { Bookmark, BookmarkKind } from "../types";

export type { Bookmark, BookmarkKind };

interface BookmarksState {
  items: Bookmark[];
}

const initialState: BookmarksState = { items: [] };

/**
 * Закладки текущего графа: узлы, к которым нужно быстро возвращаться.
 *
 * Привязаны к id узлов текущего полотна: смена графа их сбрасывает, удаление
 * узла убирает его закладку.
 *
 * У сохранённого графа закладки живут на сервере: graphExtrasMiddleware
 * отправляет туда каждую правку, а при открытии графа они подтягиваются
 * обратно (см. openGraphExtras). Пока полотно не сохранено, сервера у него нет
 * — закладки остаются в памяти вкладки и уезжают на сервер при первом
 * сохранении.
 */
const bookmarksSlice = createSlice({
  name: "bookmarks",
  initialState,
  reducers: {
    /** Поставить закладку. Повторный вызов для того же узла ничего не меняет. */
    addBookmark: (
      state,
      action: PayloadAction<{ nodeId: string; label: string; kind: BookmarkKind }>,
    ) => {
      const { nodeId, label, kind } = action.payload;
      if (state.items.some((b) => b.nodeId === nodeId)) return;
      state.items.unshift({
        nodeId,
        label,
        kind,
        note: "",
        createdAt: new Date().toISOString(),
      });
    },

    removeBookmark: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((b) => b.nodeId !== action.payload);
    },

    setBookmarkNote: (
      state,
      action: PayloadAction<{ nodeId: string; note: string }>,
    ) => {
      const item = state.items.find((b) => b.nodeId === action.payload.nodeId);
      if (item) item.note = action.payload.note;
    },

    /** Подписи узлов могли поменяться — подтягиваем их в закладки. */
    syncBookmarkLabels: (
      state,
      action: PayloadAction<Record<string, string>>,
    ) => {
      for (const item of state.items) {
        const label = action.payload[item.nodeId];
        if (label && label !== item.label) item.label = label;
      }
    },

    clearBookmarks: (state) => {
      state.items = [];
    },

    /** Положить закладки, пришедшие с сервера при открытии графа. */
    setBookmarks: (state, action: PayloadAction<Bookmark[]>) => {
      state.items = action.payload;
    },
  },

  extraReducers: (builder) => {
    // Закладки указывают на узлы конкретного полотна: со сменой графа они
    // теряют смысл, а удалённый узел уносит свою закладку с собой.
    builder
      .addCase(loadGraphFromFile, (state) => {
        state.items = [];
      })
      .addCase(setGraphData, (state) => {
        state.items = [];
      })
      .addCase(removeNodes, (state, action) => {
        const removed = new Set(action.payload);
        state.items = state.items.filter((b) => !removed.has(b.nodeId));
      });
  },
});

export const {
  addBookmark,
  removeBookmark,
  setBookmarkNote,
  syncBookmarkLabels,
  clearBookmarks,
  setBookmarks,
} = bookmarksSlice.actions;

export default bookmarksSlice.reducer;
