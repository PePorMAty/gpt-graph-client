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
import { showToast } from "../../components/toast/toastStore";
import { describeFailure, type FailureStage } from "./failureText";

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
  product?: string | null,
) {
  const { text, detail } = describeFailure(stage, payload, product);
  showToast("error", text, detail);
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
 */
export const notifyMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  // ── Построение графа по запросу ──
  // Запрос идёт минутами, а полотно под оверлеем — не единственный экран:
  // пользователь успевает уйти в библиотеку или в другую вкладку. Поэтому в
  // ленте отмечаем и начало, и исход.
  if (getGraphData.pending.match(action)) {
    showToast(
      "info",
      `Строим граф по запросу «${short(action.meta.arg.promptValue)}»`,
    );
  } else if (getGraphData.fulfilled.match(action)) {
    const prompt = short(action.meta.arg.promptValue);
    const nodes = action.payload.data?.nodes?.length ?? 0;
    // Ответ без узлов формально успешен, но графа в нём нет — на этом же месте
    // ошибку показывает и слайс.
    showToast(
      nodes ? "success" : "error",
      nodes
        ? `Граф построен: узлов ${nodes} — «${prompt}»`
        : `Граф не построен: в ответе нет узлов — «${prompt}»`,
      nodes
        ? undefined
        : "Модель ответила, но цепочки в ответе нет. Обычно помогает более " +
          "конкретный запрос: назовите продукт и способ производства.",
    );
  } else if (getGraphData.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("graph", action.payload, short(action.meta.arg.promptValue));
    }
  }

  // ── Продолжение графа ──
  // Тот же запрос к модели, только от листьев. Его неудача не показывала
  // ничего: оверлей просто гас, и об отказе узнать было неоткуда.
  else if (continueGraph.pending.match(action)) {
    showToast("info", "Продолжаем граф от выбранных узлов");
  } else if (continueGraph.fulfilled.match(action)) {
    const added = action.payload?.nodes?.length ?? 0;
    showToast(
      "success",
      added ? `Граф продолжен: новых узлов ${added}` : "Граф продолжен",
    );
  } else if (continueGraph.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("continue", action.payload);
    }
  }

  // ── Поиск источников ──
  else if (fetchStepSourcesV2.fulfilled.match(action)) {
    const found = action.payload.sources?.length ?? 0;
    const product = action.payload.product || "продукта";
    showToast(
      found ? "success" : "info",
      found
        ? `Источники найдены (${found}) — «${product}»`
        : `Новых источников не нашлось — «${product}»`,
    );
  } else if (fetchStepSourcesV2.rejected.match(action)) {
    // Отмена пользователем — это не ошибка.
    if (action.meta.aborted) {
      showToast("info", "Поиск источников отменён");
    } else {
      notifyFailure("sources", action.payload, action.meta.arg.productName);
    }
  }

  // ── Обобщение ──
  else if (aggregateStepSources.fulfilled.match(action)) {
    const needsSources = action.payload.aggregatedText === "needs-sources";
    showToast(
      needsSources ? "info" : "success",
      needsSources
        ? "Обобщение: текущих источников не хватает"
        : "Обобщение готово",
      needsSources
        ? "Модель не нашла в найденных источниках достаточно данных. " +
          "Поищите источники заново — можно с другим запросом или с другими сайтами."
        : undefined,
    );
  } else if (aggregateStepSources.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("aggregate", action.payload, action.meta.arg.productName);
    }
  }

  // ── Построение шага ──
  else if (buildStep.fulfilled.match(action)) {
    const insufficient = action.payload.sourcesStatus === "insufficient";
    showToast(
      insufficient ? "info" : "success",
      insufficient
        ? "Шаг построен, но источников не хватило"
        : "Шаг построен",
      insufficient
        ? "Шаг собран по тому, что было: по части продуктов данных не нашлось. " +
          "Их названия перечислены в панели продукта — найдите для них источники " +
          "и постройте шаг заново."
        : undefined,
    );
  } else if (buildStep.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("build", action.payload, action.meta.arg.productName);
    }
  }

  // ── Преобразования между продуктами ──
  // Модалку можно закрыть, не дожидаясь ответа, поэтому уведомление
  // обязательно: иначе о готовности узнать неоткуда.
  else if (
    fetchTransformationsForNeighbors.fulfilled.match(action) ||
    fetchTransformationBetween.fulfilled.match(action)
  ) {
    showToast("success", "Преобразования получены");
  } else if (
    fetchTransformationsForNeighbors.rejected.match(action) ||
    fetchTransformationBetween.rejected.match(action)
  ) {
    if (!action.meta.aborted) {
      notifyFailure("transformations", action.payload);
    }
  }

  // ── Карточка продукта ──
  else if (fetchProductCard.fulfilled.match(action)) {
    showToast("success", "Карточка продукта заполнена");
  } else if (fetchProductCard.rejected.match(action)) {
    if (!action.meta.aborted) {
      notifyFailure("card", action.payload);
    }
  }

  return result;
};
