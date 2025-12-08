import { configureStore } from "@reduxjs/toolkit";
import gptSlice from "./slices/gptSlice";

const store = configureStore({
  reducer: {
    graph: gptSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
