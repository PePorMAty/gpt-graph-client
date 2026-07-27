import { useCallback, useSyncExternalStore } from "react";

export type AiModelOption = { value: string; label: string; hint?: string };
export type AiConfig = { provider: string; model: string };

export const AI_PROVIDERS: AiModelOption[] = [
  { value: "", label: "По умолчанию (сервер)" },
  { value: "openai", label: "OpenAI" },
  { value: "qwen", label: "Qwen (DashScope)" },
];

// Списки моделей ограничены теми, что реально доступны нашим ключам:
// лишние варианты в выпадашке дают 403 AccessDenied уже после отправки запроса.
export const AI_MODELS: Record<string, AiModelOption[]> = {
  "": [{ value: "", label: "По умолчанию" }],
  openai: [
    { value: "", label: "По умолчанию (сервер)" },
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
  qwen: [
    { value: "", label: "По умолчанию (сервер)" },
    {
      value: "qwen3.8-max-preview",
      label: "Qwen3.8 Max Preview",
      hint: "Новейший флагман, превью: максимальное качество, поведение может меняться",
    },
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
    {
      value: "qwen3.6-flash",
      label: "Qwen3.6 Flash",
      hint: "Самая быстрая и дешёвая, для простых задач",
    },
  ],
};

const STORAGE_KEY = "ai-model-config";
const EMPTY: AiConfig = { provider: "", model: "" };

// Провайдер/модель из localStorage могли устареть (список моделей меняется),
// поэтому любое значение извне прогоняем через каталог.
function normalize(cfg: AiConfig): AiConfig {
  const provider = AI_PROVIDERS.some((p) => p.value === cfg.provider)
    ? cfg.provider
    : "";
  const models = AI_MODELS[provider] ?? AI_MODELS[""];
  const model = models.some((m) => m.value === cfg.model) ? cfg.model : "";
  return { provider, model };
}

function load(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return normalize({
      provider: String(parsed?.provider ?? ""),
      model: String(parsed?.model ?? ""),
    });
  } catch {
    return EMPTY;
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
    // у провайдеров разные каталоги моделей — при смене сбрасываем модель
    setAiConfig({
      provider,
      model: provider === current.provider ? current.model : "",
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setAiConfig({ provider: current.provider, model });
  }, []);

  return { config, setProvider, setModel };
}
