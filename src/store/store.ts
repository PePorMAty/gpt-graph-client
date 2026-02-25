import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";
import savedGraphsSlice from "./slices/savedGraphSlice";
import sourcesSlice from "./slices/sourcesSlice";

const store = configureStore({
  reducer: {
    graph: gptSlice,
    savedGraphs: savedGraphsSlice,
    sources: sourcesSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
