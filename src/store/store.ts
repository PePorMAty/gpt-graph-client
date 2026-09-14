import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";
import savedGraphsSlice from "./slices/savedGraphSlice";
import sourcesSlice from "./slices/sourcesSlice";
import bookmarksSlice from "./slices/bookmarksSlice";
import historySlice from "./slices/historySlice";
import industrySlice from "./slices/industrySlice";
import { notifyMiddleware } from "./middleware/notifyMiddleware";
import { historyMiddleware } from "./middleware/historyMiddleware";
import { graphExtrasMiddleware } from "./middleware/graphExtrasMiddleware";

const store = configureStore({
  reducer: {
    graph: gptSlice,
    savedGraphs: savedGraphsSlice,
    sources: sourcesSlice,
    bookmarks: bookmarksSlice,
    history: historySlice,
    industry: industrySlice,
  },
  middleware: (getDefaultMiddleware) =>
    // graphExtrasMiddleware — после historyMiddleware: он синхронизирует с
    // сервером в том числе записи, которые historyMiddleware только что завёл.
    getDefaultMiddleware().concat(
      notifyMiddleware,
      historyMiddleware,
      graphExtrasMiddleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
