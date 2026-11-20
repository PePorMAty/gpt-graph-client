// Чат с ИИ в открытом графе: POST /graphs/gpt/chat (сервер routes/chat/,
// PG-MIGRATION.md, этап 4).
//
// Ответ идёт потоком строк JSON (NDJSON): что модель смотрит, предложения и
// в конце ответ — человек видит ход, пока модель ходит по базе десятки
// секунд. Поэтому fetch с чтением тела по кускам, а не axios: тот в
// браузере отдаёт тело только целиком.

import type { ChatGraphSlice } from "../../utils/chatSlice";

type NodeRef = { id: string; label: string };

/**
 * Предложения модели — карточки с кнопкой; граф меняет человек. Каждое
 * ведёт в то, что на сайте уже есть: мастер шага, окно кодов, вкладку
 * карточки узла, переименование, объединение узлов.
 */
export type ChatProposal =
  | { kind: "step"; nodeId: string; label: string; direction: "up" | "down"; why?: string }
  | { kind: "show"; nodes: NodeRef[] }
  | { kind: "codes"; nodes: NodeRef[]; why?: string }
  | {
      kind: "balance";
      nodeId: string;
      label: string;
      why?: string;
      /** На 1 т этого сырья (узел и название); нет — сырьё по умолчанию. */
      basisId?: string;
      basisLabel?: string;
      /** «Известные данные» расчёта — нормы, выходы, соотношения от модели. */
      knownData?: string;
      /** Посчитать заново, не брать готовый расчёт из базы. */
      force?: boolean;
    }
  | { kind: "tech"; nodeId: string; label: string; nodeKind?: string; why?: string }
  | { kind: "rename"; nodeId: string; label: string; newLabel: string; nodeKind?: string; why?: string }
  | { kind: "merge"; fromId: string; fromLabel: string; intoId: string; intoLabel: string; why?: string }
  | { kind: "add"; id?: string; label: string; nearId?: string; nearLabel?: string; why?: string }
  | { kind: "sources"; nodeId: string; label: string; direction: "up" | "down"; web?: boolean; why?: string }
  | { kind: "delete"; nodes: NodeRef[]; why?: string }
  | { kind: "layout"; why?: string }
  | { kind: "unlayout" }
  /** Отменить действия прошлых ответов ИИ — граф, каким был до них. */
  | { kind: "undo"; why?: string }
  /** План большой задачи: человек одобряет кнопкой «Выполнить план». */
  | { kind: "plan"; title: string; steps: string[]; requests?: number }
  /** Кусок цепочки из графа библиотеки — к продукту открытого графа. */
  | {
      kind: "import";
      nodeId: string;
      label: string;
      direction: "up" | "down";
      depth: number;
      graphId: string;
      graphName: string;
      libraryNodeId: string;
      why?: string;
    }
  /** Ответ — отчёт: его можно скачать файлом. */
  | { kind: "report"; title: string }
  | { kind: "alternatives"; nodeId: string; label: string; direction: "up" | "down"; why?: string }
  | { kind: "describe"; nodeId: string; label: string; description: string; industry?: string; mainPurpose?: string }
  | { kind: "fillcard"; nodeId: string; label: string; nodeKind?: string; why?: string }
  | { kind: "bookmark"; nodes: NodeRef[]; remove?: boolean };

/**
 * Какие карточки клиент умеет показывать — уходят в запрос (proposals):
 * модель видит только эти инструменты. Сервер первой версии поле не знает
 * и предлагает шаг и показ.
 */
export const CHAT_PROPOSAL_KINDS: ChatProposal["kind"][] = [
  "step",
  "show",
  "codes",
  "balance",
  "tech",
  "rename",
  "merge",
  "add",
  "sources",
  "delete",
  "layout",
  "unlayout",
  "undo",
  "plan",
  "import",
  "report",
  "alternatives",
  "describe",
  "fillcard",
  "bookmark",
];

const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";
const isRefs = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((n) => isStr(n?.id) && isStr(n?.label));

/** Знакомое ли предложение и все ли поля на месте: сервер бывает новее клиента. */
export function isKnownProposal(p: unknown): p is ChatProposal {
  const x = p as Record<string, unknown> | null;
  switch (x?.kind) {
    case "step":
    case "sources":
    case "alternatives":
      return isStr(x.nodeId) && isStr(x.label) && (x.direction === "up" || x.direction === "down");
    case "describe":
      return isStr(x.nodeId) && isStr(x.label) && isStr(x.description);
    case "fillcard":
      return isStr(x.nodeId) && isStr(x.label);
    case "bookmark":
      return isRefs(x.nodes);
    case "show":
    case "codes":
    case "delete":
      return isRefs(x.nodes);
    case "layout":
    case "unlayout":
    case "undo":
      return true;
    case "plan":
      return isStr(x.title) && Array.isArray(x.steps) && x.steps.length > 0 && x.steps.every(isStr);
    case "report":
      return isStr(x.title);
    case "import":
      return (
        isStr(x.nodeId) &&
        isStr(x.label) &&
        isStr(x.graphId) &&
        isStr(x.graphName) &&
        isStr(x.libraryNodeId) &&
        (x.direction === "up" || x.direction === "down")
      );
    case "balance":
    case "tech":
      return isStr(x.nodeId) && isStr(x.label);
    case "rename":
      return isStr(x.nodeId) && isStr(x.label) && isStr(x.newLabel);
    case "merge":
      return isStr(x.fromId) && isStr(x.fromLabel) && isStr(x.intoId) && isStr(x.intoLabel);
    case "add":
      return isStr(x.label);
    default:
      return false;
  }
}

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
  proposals?: ChatProposal["kind"][];
  /**
   * С подтверждением (по умолчанию) или автопилот: действия выполняет сайт
   * сам и присылает итог сообщением с continuation. Старый сервер поля не
   * знает — отвечает как с подтверждением.
   */
  mode?: "confirm" | "auto";
  continuation?: boolean;
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
  const d: ChatDone = done;
  return { ...d, proposals: (d.proposals ?? []).filter(isKnownProposal) };
}
