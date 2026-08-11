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
import { showToast } from "../../components/toast/toastStore";

function errorText(payload: unknown, fallback: string): string {
  return typeof payload === "string" && payload.trim() ? payload : fallback;
}

/**
 * Уведомления о завершении долгих стадий шага: поиск источников, обобщение,
 * построение. Живёт в middleware, а не в компонентах, чтобы тост показывался
 * даже если панель продукта в этот момент закрыта или переключена.
 */
export const notifyMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  // ── Поиск источников ──
  if (fetchStepSourcesV2.fulfilled.match(action)) {
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
      showToast(
        "error",
        errorText(action.payload, "Поиск источников не удался"),
      );
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
    );
  } else if (aggregateStepSources.rejected.match(action)) {
    if (!action.meta.aborted) {
      showToast("error", errorText(action.payload, "Обобщение не удалось"));
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
    );
  } else if (buildStep.rejected.match(action)) {
    if (!action.meta.aborted) {
      showToast("error", errorText(action.payload, "Построение не удалось"));
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
      showToast(
        "error",
        errorText(action.payload, "Не удалось получить преобразования"),
      );
    }
  }

  // ── Карточка продукта ──
  else if (fetchProductCard.fulfilled.match(action)) {
    showToast("success", "Карточка продукта заполнена");
  } else if (fetchProductCard.rejected.match(action)) {
    if (!action.meta.aborted) {
      showToast(
        "error",
        errorText(action.payload, "Не удалось заполнить карточку"),
      );
    }
  }

  return result;
};
