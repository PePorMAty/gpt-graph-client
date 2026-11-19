// Чат с ИИ в открытом графе: POST /graphs/gpt/chat (сервер routes/chat/,
// PG-MIGRATION.md, этап 4).
//
// Ответ идёт потоком строк JSON (NDJSON): что модель смотрит, предложения и
// в конце ответ — человек видит ход, пока модель ходит по базе десятки
// секунд. Поэтому fetch с чтением тела по кускам, а не axios: тот в
// браузере отдаёт тело только целиком.

import type { ChatGraphSlice } from "../../utils/chatSlice";

export type ChatProposal =
  | { kind: "step"; nodeId: string; label: string; direction: "up" | "down"; why?: string }
  | { kind: "show"; nodes: { id: string; label: string }[] };

export interface ChatTool {
  name: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ChatDone {
  type: "done";
  reply: string;
  proposals: ChatProposal[];
  tools: ChatTool[];
  usage: { requests: number; tokens: number };
  model?: string | null;
}

export type ChatEvent =
  | ({ type: "tool" } & ChatTool)
  | { type: "proposal"; proposal: ChatProposal }
  | ChatDone
  | { type: "error"; error: string };

export interface ChatRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  graph: ChatGraphSlice;
  provider?: string;
  model?: string;
}

/** Сервер старее клиента: чата у него ещё нет (404). */
export class ChatUnavailableError extends Error {
  constructor() {
    super("Сервер ещё не умеет чат — его нужно обновить.");
  }
}

/**
 * Строки NDJSON из потока: каждая — событие onEvent. Строка, разрезанная
 * между кусками, собирается; битая строка пропускается.
 */
export async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: ChatEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  const flush = (line: string) => {
    const s = line.trim();
    if (!s) return;
    try {
      onEvent(JSON.parse(s) as ChatEvent);
    } catch {
      // битая строка — не повод ронять разговор
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    lines.forEach(flush);
  }
  flush(rest + decoder.decode());
}

/**
 * Спросить чат. onEvent — события по мере прихода; возвращает итог (done).
 * Ошибка модели или сервера — исключение с понятным текстом.
 */
export async function streamChat(
  req: ChatRequest,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<ChatDone> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/graphs/gpt/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (res.status === 404) throw new ChatUnavailableError();
  if (!res.ok || !res.body) {
    const msg = await res
      .json()
      .then((j: { error?: string }) => j?.error)
      .catch(() => null);
    throw new Error(`сервер ответил ошибкой ${res.status}${msg ? ` (${msg})` : ""}`);
  }
  let done: ChatDone | null = null;
  let error: string | null = null;
  await readNdjson(res.body, (e) => {
    if (e.type === "done") done = e;
    else if (e.type === "error") error = e.error;
    onEvent(e);
  });
  if (error) throw new Error(error);
  if (!done) throw new Error("ответ оборвался — попробуйте ещё раз");
  return done;
}
