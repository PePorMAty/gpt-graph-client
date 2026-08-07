import { useCallback, useSyncExternalStore } from "react";

export type AiModelOption = { value: string; label: string; hint?: string };
export type AiConfig = { provider: string; model: string };

export const AI_PROVIDERS: AiModelOption[] = [
  // Значение "qwen" — ключ провайдера на сервере (DashScope-совместимый шлюз),
  // менять его нельзя; через него же идут DeepSeek-модели тарифного плана.
  { value: "qwen", label: "DashScope (Qwen / DeepSeek)" },
  { value: "openai", label: "OpenAI" },
];

// Списки моделей ограничены теми, что реально доступны нашим ключам:
// лишние варианты в выпадашке дают 403 AccessDenied уже после отправки запроса.
// Первая модель в списке — дефолт провайдера (см. defaultModelFor).
export const AI_MODELS: Record<string, AiModelOption[]> = {
  // Состав списка — под тарифный план подписки (Token Plan). qwen-plus и
  // qwen-flash убраны: по подписке они не обслуживаются.
  // qwen3.8-max-preview и kimi-k2.7-code не добавлены: обе отдают
  // access_denied. glm-5.2 не добавлена: не поддерживает enable_search, то
  // есть непригодна для поиска источников.
  qwen: [
    {
      value: "qwen3.7-plus",
      label: "Qwen3.7 Plus",
      hint: "По умолчанию: баланс качества, скорости и цены",
    },
    {
      value: "qwen3.7-max",
      label: "Qwen3.7 Max",
      hint: "Флагман: лучшее качество и глубокие рассуждения, дороже",
    },
    {
      value: "qwen3.6-flash",
      label: "Qwen3.6 Flash",
      hint: "Быстрая и дешёвая, соблюдает JSON-схему",
    },
    {
      value: "deepseek-v4-pro",
      label: "DeepSeek V4 Pro",
      hint: "Сильные рассуждения; ответ может целиком уходить в размышления",
    },
    {
      value: "deepseek-v4-flash-0731",
      label: "DeepSeek V4 Flash",
      hint: "Быстрая версия DeepSeek",
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
