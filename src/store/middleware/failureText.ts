/**
 * Техническая причина отказа → то, что можно прочитать в ленте уведомлений.
 *
 * Санки отдают в rejectWithValue строки вида «step/sources: server returned
 * success=false» — это адрес маршрута и внутренний признак, а не объяснение.
 * В ленте такая строка не отвечала ни на один вопрос: что именно не вышло, из-за
 * чего и что теперь делать. Здесь она превращается в человеческую фразу, а сама
 * строка остаётся второй строкой — по ней ищут причину в логах сервера.
 */

/** Стадия, на которой всё оборвалось: от неё зависит и заголовок, и совет. */
export type FailureStage =
  | "graph"
  | "continue"
  | "sources"
  | "aggregate"
  | "build"
  | "transformations"
  | "card";

const STAGE_TITLE: Record<FailureStage, string> = {
  graph: "Не удалось построить граф",
  continue: "Не удалось продолжить граф",
  sources: "Не удалось найти источники",
  aggregate: "Не удалось обобщить источники",
  build: "Не удалось построить шаг",
  transformations: "Не удалось получить преобразования",
  card: "Не удалось заполнить карточку",
};

export interface Failure {
  /** Короткая фраза для тоста и первой строки ленты. */
  text: string;
  /** Пояснение и техническая причина — вторая строка в ленте. */
  detail?: string;
}

/** Причина отказа как её назвал сервер или axios. */
function rawText(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (payload && typeof payload === "object") {
    const inner = (payload as { error?: unknown }).error;
    if (typeof inner === "string") return inner.trim();
    if (inner && typeof inner === "object") {
      const msg = (inner as { message?: unknown }).message;
      if (typeof msg === "string") return msg.trim();
    }
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === "string") return msg.trim();
  }
  return "";
}

/**
 * Совет по виду причины. Возвращает null, если причина уже написана
 * по-человечески — тогда её и показываем, без наших домыслов.
 */
function explain(raw: string): string | null {
  const s = raw.toLowerCase();

  // Запрос дошёл, сервер ответил отказом без объяснения. Почти всегда это
  // модель: кончился ключ, превышен лимит, ответ не разобрался.
  if (s.includes("success=false")) {
    return (
      "Запрос дошёл до сервера, но тот ответил отказом без причины. " +
      "Чаще всего дело в модели: не принят ключ, превышен лимит или ответ " +
      "пришёл в неожиданном виде. Причина видна в логах сервера."
    );
  }
  if (s.includes("network error") || s.includes("err_network")) {
    return "Сервер не отвечает. Проверьте, запущен ли он и есть ли связь.";
  }
  if (s.includes("timeout") || s.includes("etimedout")) {
    return "Сервер не ответил вовремя. Запросы к модели идут минутами — попробуйте ещё раз.";
  }
  const status = /status code (\d{3})/.exec(s)?.[1];
  if (status) {
    if (status.startsWith("5")) {
      return `Сервер ответил ошибкой ${status}. Это сбой на его стороне — смотрите логи.`;
    }
    if (status === "429") {
      return "Слишком много запросов подряд. Подождите немного и повторите.";
    }
    if (status.startsWith("4")) {
      return `Сервер отклонил запрос (${status}) — он счёл его неправильным.`;
    }
  }
  if (s.includes("request error")) {
    return "Запрос не дошёл до сервера или оборвался на полпути.";
  }
  if (s.includes("chain session is not started") || s.includes("no chain session")) {
    return "Построение по шагам для этого узла не начиналось — запустите его заново.";
  }
  if (s.includes("node not found")) {
    return "Узла больше нет на полотне — возможно, его удалили, пока шёл запрос.";
  }
  return null;
}

/**
 * Что показать пользователю по отказу.
 *
 * `product` — название продукта, если стадия к нему привязана: «не нашли
 * источники» без указания, для чего именно, на графе в сотню узлов бесполезно.
 */
export function describeFailure(
  stage: FailureStage,
  payload: unknown,
  product?: string | null,
): Failure {
  const raw = rawText(payload);
  const hint = explain(raw);
  const title = STAGE_TITLE[stage];
  const text = product ? `${title} для «${product}»` : title;

  // Причина уже человеческая (сервер прислал понятный текст) — показываем её,
  // а не нашу заготовку.
  if (!hint) {
    return raw ? { text, detail: raw } : { text };
  }
  return { text, detail: raw ? `${hint} (${raw})` : hint };
}
