import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { AppDispatch, RootState } from "../store";
import {
  lookupLocalSources,
  uploadLocalDocument,
  type LocalDocument,
  type LocalSourceCounts,
  type UploadResult,
} from "../api/local-sources-api";
import { industryKey } from "./industrySlice";
import { fetchStepSourcesV2 } from "../api/step-chain-api";

/** Файл в очереди загрузки PDF на сервер. */
export interface UploadJob {
  id: number;
  fileName: string;
  bytes: number;
  state: "waiting" | "uploading" | "done" | "duplicate" | "error";
  /** 0…1 — какая доля файла уже отправлена. */
  progress: number;
  /** Документ в базе — после загрузки (или тот, что уже был). */
  document?: LocalDocument;
  error?: string;
  warnings: string[];
}

/**
 * Локальная база источников на сервере: PDF заказчика и источники, которые
 * модель находила раньше.
 *
 * Как опознание продуктов: появился продукт на полотне — спрашиваем сервер,
 * есть ли у него источники. Нет — ничего не показываем. Сами источники
 * запрашиваются позже, когда нужны (карточка, окно построения шага).
 *
 * Здесь же очередь загрузки PDF: она живёт дольше вкладки, из которой её
 * начали, — переключились на другой раздел, а файлы грузятся дальше.
 */
interface LocalSourcesState {
  /** По нормализованному названию продукта (industryKey). */
  counts: Record<string, LocalSourceCounts>;
  /**
   * Растёт, когда база изменилась (загрузили или удалили PDF, модель нашла
   * новое): известные числа устарели, и Flow спрашивает заново — все сразу.
   */
  version: number;
  /** С какой версией базы сверены counts. */
  checkedVersion: number;
  status: "idle" | "loading" | "succeeded" | "failed";
  uploads: UploadJob[];
}

const initialState: LocalSourcesState = {
  counts: {},
  version: 0,
  checkedVersion: 0,
  status: "idle",
  uploads: [],
};

/** Столько же принимает сервер за один запрос. */
const CHUNK = 500;

/**
 * Спросить сервер о продуктах графа: о новых — всегда, об остальных — если
 * база изменилась. Старые числа до ответа не стираем, иначе значки на узлах
 * мигали бы после каждой загрузки.
 */
export const checkLocalSources = createAsyncThunk<
  { counts: Record<string, LocalSourceCounts>; version: number },
  string[],
  { state: RootState }
>("localSources/check", async (names, { getState, rejectWithValue }) => {
  const { counts, version, checkedVersion } = getState().localSources;
  const all = version !== checkedVersion;
  const pending = [...new Set(names.map((n) => String(n ?? "").trim()))].filter(
    (n) => n && (all || !counts[industryKey(n)]),
  );
  const results: Record<string, LocalSourceCounts> = {};
  try {
    for (let i = 0; i < pending.length; i += CHUNK) {
      const data = await lookupLocalSources(pending.slice(i, i + CHUNK));
      for (const [name, c] of Object.entries(data)) results[industryKey(name)] = c;
    }
    return { counts: results, version };
  } catch (e) {
    // База источников необязательна: без неё приложение работает как раньше.
    return rejectWithValue(e instanceof Error ? e.message : String(e));
  }
});

const localSourcesSlice = createSlice({
  name: "localSources",
  initialState,
  reducers: {
    /** База изменилась — числа по всем продуктам спросить заново. */
    invalidateLocalSources(state) {
      state.version += 1;
    },
    uploadQueued(state, action: PayloadAction<UploadJob>) {
      state.uploads.push(action.payload);
    },
    uploadStarted(state, action: PayloadAction<number>) {
      const job = state.uploads.find((j) => j.id === action.payload);
      if (job) job.state = "uploading";
    },
    uploadProgress(
      state,
      action: PayloadAction<{ id: number; progress: number }>,
    ) {
      const job = state.uploads.find((j) => j.id === action.payload.id);
      if (job) job.progress = action.payload.progress;
    },
    uploadFinished(
      state,
      action: PayloadAction<{ id: number; result: UploadResult }>,
    ) {
      const job = state.uploads.find((j) => j.id === action.payload.id);
      if (!job) return;
      const { document, duplicate, warnings } = action.payload.result;
      job.state = duplicate ? "duplicate" : "done";
      job.progress = 1;
      job.document = document;
      job.warnings = warnings ?? [];
    },
    uploadFailed(state, action: PayloadAction<{ id: number; error: string }>) {
      const job = state.uploads.find((j) => j.id === action.payload.id);
      if (!job) return;
      job.state = "error";
      job.error = action.payload.error;
    },
    /** Убрать из очереди всё, что уже не грузится. */
    clearFinishedUploads(state) {
      state.uploads = state.uploads.filter(
        (j) => j.state === "waiting" || j.state === "uploading",
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkLocalSources.pending, (state) => {
        state.status = "loading";
      })
      .addCase(checkLocalSources.fulfilled, (state, action) => {
        state.status = "succeeded";
        Object.assign(state.counts, action.payload.counts);
        // Пока шёл запрос, база могла измениться ещё раз — тогда версия
        // останется несверенной, и следующий запрос спросит всё снова.
        state.checkedVersion = action.payload.version;
      })
      .addCase(checkLocalSources.rejected, (state) => {
        state.status = "failed";
      })
      // Поиск через модель сохранил найденное на сервере — у продукта стало
      // больше источников в базе.
      .addCase(fetchStepSourcesV2.fulfilled, (state) => {
        state.version += 1;
      });
  },
});

export const { invalidateLocalSources, clearFinishedUploads } =
  localSourcesSlice.actions;
const { uploadQueued, uploadStarted, uploadProgress, uploadFinished, uploadFailed } =
  localSourcesSlice.actions;

/** Сервер больше не примет (см. LOCAL-SOURCES.md сервера). */
const MAX_PDF_BYTES = 100 * 1024 * 1024;

/**
 * Файлы очереди — вне стора: File не сериализуется, а в сторе хватает
 * описания задачи.
 */
const queuedFiles = new Map<number, File>();
let lastJobId = 0;
/** Файлы грузятся по одному: так понятно, какой идёт, и сервер не душим. */
let queue: Promise<void> = Promise.resolve();

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Поставить PDF в очередь загрузки. Что не PDF или слишком велико, сразу
 * помечаем ошибкой — без отправки на сервер.
 */
export const uploadLocalDocuments =
  (files: File[]) => (dispatch: AppDispatch) => {
    for (const file of files) {
      const id = ++lastJobId;
      const problem = !isPdfFile(file)
        ? "Это не PDF — принимаются только файлы .pdf."
        : file.size > MAX_PDF_BYTES
          ? "PDF больше 100 МБ — сервер такие не принимает."
          : null;
      dispatch(
        uploadQueued({
          id,
          fileName: file.name,
          bytes: file.size,
          state: problem ? "error" : "waiting",
          progress: 0,
          error: problem ?? undefined,
          warnings: [],
        }),
      );
      if (problem) continue;
      queuedFiles.set(id, file);
      queue = queue.then(() => runUpload(id, dispatch));
    }
  };

async function runUpload(id: number, dispatch: AppDispatch): Promise<void> {
  const file = queuedFiles.get(id);
  queuedFiles.delete(id);
  if (!file) return;
  dispatch(uploadStarted(id));
  let shown = 0;
  try {
    const result = await uploadLocalDocument(file, (p) => {
      // Событий прогресса сотни — полосе хватит шага в 2 %.
      if (p - shown >= 0.02 || p === 1) {
        shown = p;
        dispatch(uploadProgress({ id, progress: p }));
      }
    });
    dispatch(uploadFinished({ id, result }));
    // Новый документ: у продуктов графа могли появиться источники, и список
    // документов тоже устарел.
    if (!result.duplicate) dispatch(invalidateLocalSources());
  } catch (e) {
    dispatch(
      uploadFailed({ id, error: e instanceof Error ? e.message : String(e) }),
    );
  }
}

/** Числа по продукту, если сервер о нём уже ответил. */
export const selectLocalSourceCounts = (
  state: RootState,
  productName: string,
): LocalSourceCounts | undefined =>
  state.localSources.counts[industryKey(productName)];

export default localSourcesSlice.reducer;
