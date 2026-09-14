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

function errorText(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  // Часть роутов отдаёт причину объектом { error: "…" } — достаём и её, иначе
  // на экран ушла бы общая отговорка вместо того, что назвал сервер.
  if (payload && typeof payload === "object") {
    const inner = (payload as { error?: unknown }).error;
    if (typeof inner === "string" && inner.trim()) return inner;
  }
  return fallback;
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
    );
  } else if (getGraphData.rejected.match(action)) {
    if (!action.meta.aborted) {
      showToast("error", errorText(action.payload, "Не удалось построить граф"));
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
      showToast("error", errorText(action.payload, "Не удалось продолжить граф"));
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
