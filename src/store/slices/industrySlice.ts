import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import type { RootState } from "../store";
import {
  lookupIndustry,
  type IndustryProductInfo,
} from "../api/industry-api";

/**
 * Ключ продукта в таблице результатов.
 *
 * Одно и то же вещество в графе пишут по-разному — «Изобутилен» и
 * «изобутилен » встречаются в одном полотне. Сервер ищет по нормализованному
 * названию, и здесь ключ должен получаться так же, иначе один и тот же продукт
 * проверялся бы дважды и давал два разных бейджа.
 */
export const industryKey = (name: string): string =>
  String(name ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");

interface IndustryState {
  /** Подключён ли реестр на сервере. null — ещё не спрашивали. */
  ready: boolean | null;
  /** Почему не подключён — показываем в интерфейсе вместо пустоты. */
  reason: string | null;
  /** Дата актуальности выгрузки. */
  actualAt: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  /** Результаты по нормализованному названию продукта. */
  results: Record<string, IndustryProductInfo>;
}

const initialState: IndustryState = {
  ready: null,
  reason: null,
  actualAt: null,
  status: "idle",
  error: null,
  results: {},
};

/**
 * Проверить продукты по реестру.
 *
 * Спрашиваем только то, чего ещё нет в таблице: набор продуктов графа между
 * включениями слоя не меняется, а список бывает на сотни названий.
 */
export const checkIndustry = createAsyncThunk<
  { results: Record<string, IndustryProductInfo>; ready: boolean; reason?: string; actualAt?: string | null },
  string[],
  { state: RootState }
>("industry/check", async (names, { getState, rejectWithValue }) => {
  const known = getState().industry.results;
  const pending = [...new Set(names.map((n) => String(n ?? "").trim()))].filter(
    (n) => n && !known[industryKey(n)],
  );

  if (!pending.length) {
    return { results: {}, ready: getState().industry.ready !== false };
  }

  try {
    const data = await lookupIndustry(pending);
    // Раскладываем ответ по нормализованным ключам: сервер отвечает теми же
    // написаниями, что прислали, а в сторе ключ один на все варианты.
    const results: Record<string, IndustryProductInfo> = {};
    for (const [name, info] of Object.entries(data.results ?? {})) {
      results[industryKey(name)] = info;
    }
    return {
      results,
      ready: data.ready !== false,
      reason: data.reason,
      actualAt: data.actualAt ?? null,
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : "Не удалось проверить продукты по ГИСП",
    );
  }
});

const industrySlice = createSlice({
  name: "industry",
  initialState,
  reducers: {
    /** Сбросить проверку — например, при смене графа. */
    clearIndustry(state) {
      state.results = {};
      state.status = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkIndustry.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(checkIndustry.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.ready = action.payload.ready;
        state.reason = action.payload.reason ?? null;
        if (action.payload.actualAt) state.actualAt = action.payload.actualAt;
        Object.assign(state.results, action.payload.results);
      })
      .addCase(checkIndustry.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          (action.payload as string) ||
          action.error.message ||
          "Не удалось проверить продукты по ГИСП";
      });
  },
});

export const { clearIndustry } = industrySlice.actions;
export default industrySlice.reducer;
