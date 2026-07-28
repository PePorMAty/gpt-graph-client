import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";
import savedGraphsSlice from "./slices/savedGraphSlice";
import sourcesSlice from "./slices/sourcesSlice";
import { notifyMiddleware } from "./middleware/notifyMiddleware";

const store = configureStore({
  reducer: {
    graph: gptSlice,
    savedGraphs: savedGraphsSlice,
    sources: sourcesSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(notifyMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
