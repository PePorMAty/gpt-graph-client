import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";
import savedGraphsSlice from "./slices/savedGraphSlice";

const store = configureStore({
  reducer: {
    graph: gptSlice,
    savedGraphs: savedGraphsSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
