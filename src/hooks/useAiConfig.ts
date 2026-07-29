import { useCallback, useSyncExternalStore } from "react";

export type AiModelOption = { value: string; label: string; hint?: string };
export type AiConfig = { provider: string; model: string };

export const AI_PROVIDERS: AiModelOption[] = [
  { value: "qwen", label: "Qwen (DashScope)" },
  { value: "openai", label: "OpenAI" },
];

// Списки моделей ограничены теми, что реально доступны нашим ключам:
// лишние варианты в выпадашке дают 403 AccessDenied уже после отправки запроса.
// Первая модель в списке — дефолт провайдера (см. defaultModelFor).
export const AI_MODELS: Record<string, AiModelOption[]> = {
  qwen: [
    {
      value: "qwen-plus",
      label: "Qwen Plus",
      hint: "По умолчанию: проверена на схеме, баланс качества, скорости и цены",
    },
    {
      value: "qwen-flash",
      label: "Qwen Flash",
      hint: "Быстрая и дешёвая, для простых задач",
    },
    // qwen3.8-max-preview убрана намеренно: ключу отдаётся access_denied на
    // любой запрос к ней. Вернуть, когда на аккаунте появится доступ.
    {
      value: "qwen3.7-max",
      label: "Qwen3.7 Max",
      hint: "Флагман: лучшее качество и глубокие рассуждения, дороже",
    },
    {
      value: "qwen3.7-plus",
      label: "Qwen3.7 Plus",
      hint: "Баланс качества, скорости и цены — универсальный выбор",
    },
    // qwen3.6-flash убрана намеренно: не соблюдает json_schema даже со
    // strict: true (на тестовой схеме возвращала [1] и свободный текст),
    // а поиск источников и построение шага разбирают ответ по схеме.
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
  model: "qwen-plus",
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
