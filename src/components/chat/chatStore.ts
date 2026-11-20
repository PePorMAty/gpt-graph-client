// Разговор чата — в браузере, у открытого графа (PG-MIGRATION.md, этап 4: на
// этапе 5 переедет в базу, к пользователю). Ключ — conversationKey: номер
// сохранённого графа, у черновика — его первый узел. Черновик в браузере
// один, и разговор держится только у него.
//
// localStorage может быть недоступен (приватный режим, переполнен) — тогда
// разговор живёт до перезагрузки страницы, чат работает.

import type { ChatProposal } from "../../store/api/chat-api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Что модель смотрела — строки для человека. */
  tools?: string[];
  proposals?: ChatProposal[];
  /** Номера отклонённых или выполненных предложений. */
  closed?: number[];
  /** Итоги выполненных предложений по номеру — вместо кнопок карточки. */
  results?: Record<number, { ok: boolean; text: string }>;
  /** Сообщение «Автопилот: …» — итог действий для модели, а не слова человека. */
  auto?: boolean;
  requests?: number;
  error?: boolean;
}

/** Сообщений разговора храним — не больше. */
const KEEP = 60;
/** Реплик разговора — в запрос модели (сервер берёт не больше 12). */
export const HISTORY_TURNS = 12;

const PREFIX = "chat:v1:";
/** Без двоеточия: так находится и общий черновик первой версии чата. */
const UNSAVED = "unsaved";

/**
 * Ключ разговора. Сохранённый граф — по номеру. Несохранённый — по первому
 * узлу: черновик переживает перезагрузку страницы вместе с узлами, а новый
 * граф начинается с нового узла, и чат прежнего черновика в нём не
 * всплывает. Удалили первый узел — разговор начнётся заново.
 */
export function conversationKey(graphId: string | null, firstNodeId: string | null): string {
  return graphId || `${UNSAVED}:${firstNodeId ?? ""}`;
}

export const isUnsavedKey = (key: string) => key.startsWith(UNSAVED);

const keyOf = (key: string) => PREFIX + key;

export function loadConversation(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(keyOf(key));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveConversation(key: string, messages: ChatMessage[]): void {
  try {
    if (!messages.length) {
      localStorage.removeItem(keyOf(key));
      return;
    }
    localStorage.setItem(keyOf(key), JSON.stringify(messages.slice(-KEEP)));
    // Разговоры прежних черновиков — уже ни к чему: их графы заменены.
    if (isUnsavedKey(key)) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX + UNSAVED) && k !== keyOf(key)) localStorage.removeItem(k);
      }
    }
  } catch {
    // нет места или запрещено — разговор останется до перезагрузки
  }
}

/** Реплики для модели: только текст, без ошибок, последние HISTORY_TURNS. */
export function historyFor(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !m.error && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
}

// ---------- режим чата ----------

const MODE_KEY = "chat:mode";

/** Режим, выбранный последним: с подтверждением, пока автопилот не включали. */
export function loadChatMode(): "confirm" | "auto" {
  try {
    return localStorage.getItem(MODE_KEY) === "auto" ? "auto" : "confirm";
  } catch {
    return "confirm";
  }
}

export function saveChatMode(mode: "confirm" | "auto"): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // режим — удобство, а не данные
  }
}

// ---------- модель чата ----------

const MODEL_KEY = "chat:model";

/**
 * Модель чата — своя, не та, что строит шаги: чату нужна модель, которая
 * надёжно вызывает инструменты. qwen3.8-flash (20.11) на автопилоте чаще
 * отвечала словами «Готово: добавил», ничего не вызвав; шаги же flash
 * строит быстро и дёшево.
 */
export const DEFAULT_CHAT_MODEL = "qwen3.7-plus";

export function loadChatModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function saveChatModel(model: string): void {
  try {
    localStorage.setItem(MODEL_KEY, model);
  } catch {
    // выбор модели — удобство, а не данные
  }
}

// ---------- запросы к модели за день ----------

const dayKey = () => `chat:requests:${new Date().toISOString().slice(0, 10)}`;

export function requestsToday(): number {
  try {
    return Number(localStorage.getItem(dayKey())) || 0;
  } catch {
    return 0;
  }
}

export function addRequestsToday(n: number): void {
  try {
    localStorage.setItem(dayKey(), String(requestsToday() + n));
  } catch {
    // счётчик — подсказка, а не учёт
  }
}
