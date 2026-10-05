import type { Middleware } from "@reduxjs/toolkit";
import {
  aggregateStepSources,
  buildStep,
  fetchStepSourcesV2,
} from "../api/step-chain-api";
import {
  fetchTransformationBetween,
  fetchTransformationsForNeighbors,
} from "../api/transformation-between-api";
import { fetchProductCard } from "../api/product-card-api";
import { continueGraph, getGraphData } from "../api/graph-api";
import {
  getNotificationCanvas,
  setNotificationCanvas,
  showToast,
  type ToastKind,
  type ToastTarget,
} from "../../components/toast/toastStore";
import type { RootState } from "../store";
import { sourcesPoolKey } from "../slices/gptSlice";
import { describeFailure, type FailureStage } from "./failureText";

/**
 * Полотно, для которого запущен запрос, — по его requestId.
 *
 * Ответ приходит минутами позже, и за это время граф могут закрыть. Решать,
 * чьё это уведомление, надо по полотну НА МОМЕНТ ЗАПРОСА, а не ответа: иначе
 * «Шаг построен» прошлого графа всплывал поверх нового.
 */
const requestCanvas = new Map<string, string>();
let canvasSeq = 1;

/** Открыт другой граф, создан новый или полотно очищено. */
function switchCanvas() {
  canvasSeq += 1;
  setNotificationCanvas(`canvas-${canvasSeq}`);
}

/** Уведомление о запросе: его полотно и узел, если запрос про узел. */
function notify(
  kind: ToastKind,
  text: string,
  detail: string | undefined,
  canvas: string,
  target?: ToastTarget,
) {
  showToast(kind, text, detail, { canvas, ...(target ? { target } : {}) });
}

/**
 * Показать отказ понятно: что не вышло, для какого продукта и почему.
 *
 * Раньше в ленту уходила строка санка — «step/sources: server returned
 * success=false». По ней нельзя было понять ни стадию, ни продукт, ни что
 * делать дальше; сама строка теперь живёт второй строкой, для логов.
 */
function notifyFailure(
  stage: FailureStage,
  payload: unknown,
  product: string | null | undefined,
  canvas: string,
  target?: ToastTarget,
) {
  const { text, detail } = describeFailure(stage, payload, product);
  // Техническая причина в уведомление не попадает — оставляем её в консоли.
  console.warn(`[${stage}] отказ:`, payload);
  notify("error", text, detail, canvas, target);
}

/**
 * Шаг не лёг на граф: такой уже стоит на графе или он замкнул бы петлю.
 *
 * Окно мастера при этом закрывается так же, как после принятого шага, и без
 * уведомления казалось, что шаг добавлен, — а на полотне ничего не менялось.
 * Узнаётся по разнице «до/после»: шаг в сессию не записан, а у продукта
 * появилась пометка «нужны свежие источники» с причиной.
 */
function notifyDeadEnd(
  before: RootState["graph"],
  after: RootState["graph"],
  payload: unknown,
  canvas: string,
) {
  const key = (payload as { sessionKey?: string } | undefined)?.sessionKey;
  const session = key ? before.stepChainSessions[key] : undefined;
  if (!key || !session?.pendingStep) return;
  if ((after.stepChainSessions[key]?.steps.length ?? 0) !== session.steps.length) {
    return;
  }
  const anchor = before.data.nodes.find(
    (n) => n.id === session.currentProductNodeId,
  );
  const label = String(anchor?.data?.label ?? "").trim();
  if (!anchor || !label) return;
  const marker = after.needsFreshSources[sourcesPoolKey(label, session.direction)];
  const target = { nodeId: anchor.id, label };
  const names = marker?.loopOn?.length ? `«${marker.loopOn.join("», «")}»` : "";
  if (marker?.reason === "exists") {
    notify(
      "info",
      `Такой шаг уже есть на графе — «${label}»`,
      `${marker.transformation ? `«${marker.transformation}»` : "Преобразование"}` +
        `${names ? ` с ${names}` : ""} уже связано с этим продуктом, новых связей ` +
        "не добавлено. Чтобы продолжить в новом направлении, найдите свежие источники.",
      canvas,
      target,
    );
  } else if (marker?.reason === "cycle") {
    notify(
      "info",
      `Шаг не добавлен: он замкнул бы петлю — «${label}»`,
      `${names ? `Шаг возвращается к ${names}. ` : ""}` +
        "Чтобы продолжить в новом направлении, найдите свежие источники.",
      canvas,
      target,
    );
  }
}

/** Запрос пользователя в подписи уведомления: целиком он бывает на абзац. */
function short(text: string, max = 40): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Уведомления о завершении долгих стадий шага: поиск источников, обобщение,
 * построение. Живёт в middleware, а не в компонентах, чтобы тост показывался
 * даже если панель продукта в этот момент закрыта или переключена.
 *
 * Каждое уведомление знает своё полотно (см. requestCanvas) и, если запрос
 * был про узел, — узел: из ленты к нему переходят, и в тексте видно, про
 * какой продукт речь («Шаг построен — «Этилен»»).
 */
export const notifyMiddleware: Middleware = (store) => (next) => (action) => {
  // Шаг, не легший на граф, виден только по разнице «до/после».
  const graphBefore =
    (action as { type?: unknown }).type === "graph/acceptPendingStep"
      ? (store.getState() as RootState).graph
      : null;
  const result = next(action);
  const a = action as {
    type?: string;
    payload?: unknown;
    meta?: { requestId?: string };
  };
  const type = typeof a.type === "string" ? a.type : "";

  // ── Смена полотна ──
  // Открыли сохранённый граф, загрузили файл, объединили графы — всё это
  // приходит одним экшеном; очистка полотна — пустым setGraphData.
  if (
    type === "graph/loadGraphFromFile" ||
    (type === "graph/setGraphData" &&
      ((a.payload as { nodes?: unknown[] } | undefined)?.nodes?.length ?? 0) === 0)
  ) {
    switchCanvas();
  }

  // Полотно запроса запоминаем в начале, забираем в конце.
  const requestId = a.meta?.requestId;
  if (requestId && type.endsWith("/pending")) {
    requestCanvas.set(requestId, getNotificationCanvas());
  }
  let canvas = getNotificationCanvas();
  if (requestId && (type.endsWith("/fulfilled") || type.endsWith("/rejected"))) {
    canvas = requestCanvas.get(requestId) ?? canvas;
    requestCanvas.delete(requestId);
  }

  if (graphBefore) {
    notifyDeadEnd(
      graphBefore,
      (store.getState() as RootState).graph,
      a.payload,
      canvas,
    );
  }

  /** Узел по id — с подписью, какая у него сейчас на полотне. */
  const nodeTarget = (nodeId: string | undefined, fallback?: string): ToastTarget | undefined => {
    if (!nodeId) return undefined;
    const node = (store.getState() as RootState).graph.data.nodes.find((n) => n.id === nodeId);
    const label = String(node?.data?.label ?? fallback ?? "").trim();
    return { nodeId, ...(label ? { label } : {}) };
  };
  /** «— «Этилен»» в конце фразы, если продукт известен. */
  const about = (label?: string) => (label ? ` — «${label}»` : "");

  // ── Построение графа по запросу ──
  // Запрос идёт минутами, а полотно под оверлеем — не единственный экран:
  // пользователь успевает уйти в библиотеку или в другую вкладку. Поэтому в
  // ленте отмечаем и начало, и исход.
  if (getGraphData.pending.match(action)) {
    notify(
      "info",
      `Строим граф по запросу «${short(action.meta.arg.promptValue)}»`,
      undefined,
      canvas,
    );
  } else if (getGraphData.fulfilled.match(action)) {
    const prompt = short(action.meta.arg.promptValue);
    const nodes = action.payload.data?.nodes?.length ?? 0;
    // Ответ без узлов формально успешен, но графа в нём нет — на этом же месте
    // ошибку показывает и слайс.
    notify(
      nodes ? "success" : "error",
      nodes
        ? `Граф построен: узлов ${nodes} — «${prompt}»`
        : `Граф не построен: в ответе нет узлов — «${prompt}»`,
      nodes
        ? undefined
        : "Модель ответила, но цепочки в ответе нет. Обычно помогает более " +
          "конкретный запрос: назовите продукт и способ производства.",
      canvas,
    );
  } else if (getGraphData.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("graph", action.payload, short(action.meta.arg.promptValue), canvas);
    }
  }

  // ── Продолжение графа ──
  // Тот же запрос к модели, только от листьев. Его неудача не показывала
  // ничего: оверлей просто гас, и об отказе узнать было неоткуда.
  else if (continueGraph.pending.match(action)) {
    notify("info", "Продолжаем граф от выбранных узлов", undefined, canvas);
  } else if (continueGraph.fulfilled.match(action)) {
    const added = action.payload?.nodes?.length ?? 0;
    notify(
      "success",
      added ? `Граф продолжен: новых узлов ${added}` : "Граф продолжен",
      undefined,
      canvas,
    );
  } else if (continueGraph.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("continue", action.payload, null, canvas);
    }
  }

  // ── Поиск источников ──
  else if (fetchStepSourcesV2.fulfilled.match(action)) {
    const found = action.payload.sources?.length ?? 0;
    const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
    const product = action.payload.product || target?.label || "продукта";
    notify(
      found ? "success" : "info",
      found
        ? `Источники найдены (${found}) — «${product}»`
        : `Новых источников не нашлось — «${product}»`,
      undefined,
      canvas,
      target,
    );
  } else if (fetchStepSourcesV2.rejected.match(action)) {
    const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
    // Отмена пользователем — это не ошибка.
    if (action.meta.aborted) {
      notify("info", `Поиск источников отменён${about(target?.label)}`, undefined, canvas, target);
    } else {
      notifyFailure("sources", action.payload, action.meta.arg.productName, canvas, target);
    }
  }

  // ── Обобщение ──
  else if (aggregateStepSources.fulfilled.match(action)) {
    const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
    const needsSources = action.payload.aggregatedText === "needs-sources";
    notify(
      needsSources ? "info" : "success",
      needsSources
        ? `Обобщение: текущих источников не хватает${about(target?.label)}`
        : `Обобщение готово${about(target?.label)}`,
      needsSources
        ? "Модель не нашла в найденных источниках достаточно данных. " +
          "Поищите источники заново — можно с другим запросом или с другими сайтами."
        : undefined,
      canvas,
      target,
    );
  } else if (aggregateStepSources.rejected.match(action)) {
    if (!action.meta.aborted) {
      const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
      notifyFailure("aggregate", action.payload, action.meta.arg.productName, canvas, target);
    }
  }

  // ── Построение шага ──
  else if (buildStep.fulfilled.match(action)) {
    const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
    const insufficient = action.payload.sourcesStatus === "insufficient";
    notify(
      insufficient ? "info" : "success",
      insufficient
        ? `Шаг построен, но источников не хватило${about(target?.label)}`
        : `Шаг построен${about(target?.label)}`,
      insufficient
        ? "Шаг собран по тому, что было: по части продуктов данных не нашлось. " +
          "Их названия перечислены в панели продукта — найдите для них источники " +
          "и постройте шаг заново."
        : undefined,
      canvas,
      target,
    );
  } else if (buildStep.rejected.match(action)) {
    if (!action.meta.aborted) {
      const target = nodeTarget(action.meta.arg.nodeId, action.meta.arg.productName);
      notifyFailure("build", action.payload, action.meta.arg.productName, canvas, target);
    }
  }

  // ── Преобразования между продуктами ──
  // Модалку можно закрыть, не дожидаясь ответа, поэтому уведомление
  // обязательно: иначе о готовности узнать неоткуда.
  else if (fetchTransformationsForNeighbors.fulfilled.match(action)) {
    const target = nodeTarget(action.meta.arg.anchorNodeId);
    notify("success", `Преобразования получены${about(target?.label)}`, undefined, canvas, target);
  } else if (fetchTransformationBetween.fulfilled.match(action)) {
    const target = nodeTarget(action.meta.arg.fromNodeId, action.meta.arg.fromProduct);
    notify(
      "success",
      `Преобразование получено — «${action.meta.arg.fromProduct}» → «${action.meta.arg.toProduct}»`,
      undefined,
      canvas,
      target,
    );
  } else if (fetchTransformationsForNeighbors.rejected.match(action)) {
    if (!action.meta.aborted) {
      const target = nodeTarget(action.meta.arg.anchorNodeId);
      notifyFailure("transformations", action.payload, target?.label, canvas, target);
    }
  } else if (fetchTransformationBetween.rejected.match(action)) {
    if (!action.meta.aborted) {
      const target = nodeTarget(action.meta.arg.fromNodeId, action.meta.arg.fromProduct);
      notifyFailure("transformations", action.payload, action.meta.arg.fromProduct, canvas, target);
    }
  }

  // ── Карточка продукта ──
  else if (fetchProductCard.fulfilled.match(action)) {
    const target = nodeTarget(action.meta.arg.nodeId);
    notify("success", `Карточка заполнена${about(target?.label)}`, undefined, canvas, target);
  } else if (fetchProductCard.rejected.match(action)) {
    if (!action.meta.aborted) {
      const target = nodeTarget(action.meta.arg.nodeId);
      notifyFailure("card", action.payload, target?.label, canvas, target);
    }
  }

  return result;
};
