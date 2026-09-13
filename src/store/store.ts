import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";
import savedGraphsSlice from "./slices/savedGraphSlice";
import sourcesSlice from "./slices/sourcesSlice";
import bookmarksSlice from "./slices/bookmarksSlice";
import historySlice from "./slices/historySlice";
import { notifyMiddleware } from "./middleware/notifyMiddleware";
import { historyMiddleware } from "./middleware/historyMiddleware";

const store = configureStore({
  reducer: {
    graph: gptSlice,
    savedGraphs: savedGraphsSlice,
    sources: sourcesSlice,
    bookmarks: bookmarksSlice,
    history: historySlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(notifyMiddleware, historyMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
