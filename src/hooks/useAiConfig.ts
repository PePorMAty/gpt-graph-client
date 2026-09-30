import { useCallback, useSyncExternalStore } from "react";

/** Стадии, где модель может оказаться непригодной. */
export type AiStage = "search" | "card" | "graph";

export type AiModelOption = {
  value: string;
  label: string;
  hint?: string;
  /** Стадии, на которых модель не работает: там её не показываем в списке и
   *  не отправляем в запрос. Пусто/нет поля — модель годится везде. */
  unsupportedIn?: AiStage[];
};
export type AiConfig = { provider: string; model: string };

export const AI_PROVIDERS: AiModelOption[] = [
  // Значение "qwen" — ключ провайдера на сервере (DashScope-совместимый шлюз),
  // менять его нельзя; через него же идут DeepSeek и GLM тарифного плана.
  { value: "qwen", label: "DashScope (Qwen / DeepSeek / GLM)" },
  { value: "openai", label: "OpenAI" },
];

// Списки моделей ограничены теми, что реально доступны нашим ключам:
// лишние варианты в выпадашке дают 403 AccessDenied уже после отправки запроса.
// Первая модель в списке — дефолт провайдера (см. defaultModelFor).
export const AI_MODELS: Record<string, AiModelOption[]> = {
  // Состав — все текстовые модели тарифа (Token Plan). Что каждая умеет,
  // проверено на сервере прогонами scripts/check-models.js (30.09): поиск
  // источников, карточка, шаг, граф целиком. Карточку, шаг и граф делают все.
  // Поиск у одной и той же модели то находит пять источников, то в этот раз
  // не ищет вовсе — отказ случайный, и сервер повторяет пустой поиск сам.
  // Скрыты на поиске (unsupportedIn: ["search"]) только GLM: они искать в
  // интернете не умеют совсем. Там в запрос уходит первая пригодная модель.
  qwen: [
    {
      value: "qwen3.7-plus",
      label: "Qwen3.7 Plus",
      hint: "По умолчанию: баланс качества, скорости и цены",
    },
    {
      value: "qwen3.8-max",
      label: "Qwen3.8 Max",
      hint: "Новый флагман: лучшее качество, отвечает дольше",
    },
    {
      value: "qwen3.8-flash",
      label: "Qwen3.8 Flash",
      hint: "Быстрая: поиск источников ~20 с, карточка и шаг — секунды",
    },
    {
      value: "qwen3.7-max",
      label: "Qwen3.7 Max",
      hint: "Флагман прошлого поколения: глубокие ответы, дороже",
    },
    {
      value: "qwen3.6-flash",
      label: "Qwen3.6 Flash",
      hint: "Быстрая и дешёвая",
    },
    {
      value: "deepseek-v4-pro-0813",
      label: "DeepSeek V4 Pro (0813)",
      hint: "Сильные рассуждения; граф — за полторы минуты",
    },
    {
      value: "deepseek-v4-pro",
      label: "DeepSeek V4 Pro",
      hint: "Сильные рассуждения; поиск бывает долгим — до полутора минут",
    },
    {
      value: "deepseek-v4-flash-0731",
      label: "DeepSeek V4 Flash",
      hint: "Быстрая: граф — меньше минуты",
    },
    {
      value: "deepseek-v4.1-flash",
      label: "DeepSeek V4.1 Flash",
      hint: "Самая быстрая для карточки и шага",
    },
    {
      value: "glm-5.3",
      label: "GLM-5.3 (Zhipu)",
      hint: "Думает дольше остальных (карточка ~50 с); источники не ищет",
      // Не умеет искать в интернете (отказ на enable_search).
      unsupportedIn: ["search"],
    },
    {
      value: "glm-5.2",
      label: "GLM-5.2 (Zhipu)",
      hint: "Карточка и шаг за секунды; источники не ищет",
      // Не умеет искать в интернете (отказ на enable_search).
      unsupportedIn: ["search"],
    },
  ],
  openai: [
    {
      value: "gpt-5-mini",
      label: "GPT-5 Mini",
      hint: "Быстрый и дешёвый, хорош для рутинных задач",
    },
    {
      value: "gpt-5",
      label: "GPT-5",
      hint: "Максимальное качество, сложные рассуждения, дороже",
    },
  ],
};

// Пресет: провайдер и модель выбраны всегда, пункта «по умолчанию» больше нет.
// Клиент теперь ВСЕГДА шлёт provider и model, поэтому серверный дефолт
// (AI_PROVIDER / gpt-5-mini) на стадии шага не применяется.
export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "qwen",
  model: "qwen3.7-plus",
};

function defaultModelFor(provider: string): string {
  return AI_MODELS[provider]?.[0]?.value ?? DEFAULT_AI_CONFIG.model;
}

const STORAGE_KEY = "ai-model-config";

// Провайдер/модель из localStorage могли устареть (список моделей меняется,
// пункт «по умолчанию» с пустым значением убран), поэтому любое значение
// извне прогоняем через каталог и подменяем негодное пресетом.
function normalize(cfg: AiConfig): AiConfig {
  const provider = AI_PROVIDERS.some((p) => p.value === cfg.provider)
    ? cfg.provider
    : DEFAULT_AI_CONFIG.provider;
  const models = AI_MODELS[provider] ?? [];
  const model = models.some((m) => m.value === cfg.model)
    ? cfg.model
    : defaultModelFor(provider);
  return { provider, model };
}

function load(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw);
    return normalize({
      provider: String(parsed?.provider ?? ""),
      model: String(parsed?.model ?? ""),
    });
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

// Стор вынесен из компонента намеренно: панель шага перемонтируется при
// переключении продукта/направления, а выбранная модель должна доживать до
// следующих этапов (поиск → обобщение → построение) и до перезагрузки страницы.
let current: AiConfig = load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AiConfig {
  return current;
}

export function setAiConfig(next: AiConfig) {
  const normalized = normalize(next);
  if (
    normalized.provider === current.provider &&
    normalized.model === current.model
  ) {
    return;
  }
  current = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // приватный режим / переполненное хранилище — выбор просто не переживёт релоад
  }
  listeners.forEach((l) => l());
}

/**
 * Текущий выбор без хука — для thunk-ов: они шлют запросы к LLM и должны
 * уважать выбранную модель, не протаскивая её пропсами через все панели.
 */
export function getAiConfig(): AiConfig {
  return current;
}

/**
 * provider/model для тела запроса. Если на этой стадии выбранная модель не
 * работает, подставляем пригодную: иначе запрос уйдёт и вернётся пустым.
 */
export function getAiRequestFields(opts?: { stage?: AiStage }): {
  provider?: string;
  model?: string;
} {
  const { provider, model } = current;
  if (!provider) return {};
  if (!opts?.stage) return { provider, model: model || undefined };

  const models = AI_MODELS[provider] ?? [];
  const chosen = models.find((m) => m.value === model);
  if (!chosen?.unsupportedIn?.includes(opts.stage)) {
    return { provider, model: model || undefined };
  }

  const fallback = models.find((m) => !m.unsupportedIn?.includes(opts.stage!));
  return { provider, model: fallback?.value || undefined };
}

/** Работает ли выбранная модель на этой стадии. */
export function isModelUsableIn(
  stage: AiStage,
  cfg: AiConfig = current,
): boolean {
  const models = AI_MODELS[cfg.provider] ?? [];
  const chosen = models.find((m) => m.value === cfg.model);
  return !chosen?.unsupportedIn?.includes(stage);
}

export function useAiConfig() {
  const config = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setProvider = useCallback((provider: string) => {
    // у провайдеров разные каталоги моделей — при смене берём дефолт нового
    setAiConfig({
      provider,
      model:
        provider === current.provider
          ? current.model
          : defaultModelFor(provider),
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setAiConfig({ provider: current.provider, model });
  }, []);

  return { config, setProvider, setModel };
}
