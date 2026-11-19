// Разговор чата — в браузере, у открытого графа (PG-MIGRATION.md, этап 4: на
// этапе 5 переедет в базу, к пользователю). Ключ — номер сохранённого графа;
// у несохранённого — общий черновик.
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
  requests?: number;
  error?: boolean;
}

/** Сообщений разговора храним — не больше. */
const KEEP = 60;
/** Реплик разговора — в запрос модели (сервер берёт не больше 12). */
export const HISTORY_TURNS = 12;

const keyOf = (graphId: string | null) => `chat:v1:${graphId || "unsaved"}`;

export function loadConversation(graphId: string | null): ChatMessage[] {
  try {
    const raw = localStorage.getItem(keyOf(graphId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveConversation(graphId: string | null, messages: ChatMessage[]): void {
  try {
    if (messages.length) localStorage.setItem(keyOf(graphId), JSON.stringify(messages.slice(-KEEP)));
    else localStorage.removeItem(keyOf(graphId));
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
