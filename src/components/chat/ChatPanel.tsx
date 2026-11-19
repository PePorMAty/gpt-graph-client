// Чат с ИИ в открытом графе (PG-MIGRATION.md, этап 4) — панель справа от
// полотна, рядом с карточкой узла (та открывается слева).
//
// Что делает модель: смотрит базу (карточка продукта, поиск по ИТС) и
// открытый граф, отвечает со ссылками и предлагает действия карточками.
// Ничего не меняется без человека: «Построить шаг» открывает обычный мастер
// шага у узла, «Показать на графе» — подводит камеру.
//
// Граф читается из хранилища только при отправке (store.getState): панель не
// подписана на узлы, и граф на сотни узлов из-за неё не перерисовывается.

import { memo, useCallback, useEffect, useRef, useState, type FC } from "react";
import { useStore } from "react-redux";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { RootState } from "../../store/store";
import { useAppSelector } from "../../store/hooks";
import { getAiRequestFields, useAiConfig } from "../../hooks/useAiConfig";
import { buildChatSlice } from "../../utils/chatSlice";
import { ChatUnavailableError, streamChat, type ChatProposal } from "../../store/api/chat-api";
import { plural } from "../../utils/plural";
import { showToast } from "../toast/toastStore";
import { ChatIcon, CloseIcon, SendIcon, TrashIcon } from "../icons";
import {
  addRequestsToday,
  historyFor,
  loadConversation,
  requestsToday,
  saveConversation,
  type ChatMessage,
} from "./chatStore";
import { requestStep, showNodes } from "./chatActions";
import styles from "./ChatPanel.module.css";

const EXAMPLES = [
  "Что это за продукт и где его производят?",
  "Из чего ещё можно получить этот продукт?",
  "Что делают из этого продукта дальше?",
];

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const DIR = { up: "вверх", down: "вниз" } as const;

interface ChatPanelProps {
  onClose: () => void;
  selectedNodeId: string | null;
  readOnly?: boolean;
}

export const ChatPanel: FC<ChatPanelProps> = memo(({ onClose, selectedNodeId, readOnly = false }) => {
  const store = useStore<RootState>();
  const graphId = useAppSelector((s) => s.savedGraphs.openedGraphId);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName) ?? "";
  // Подпись выбранного узла — только строка: панель не перерисовывается от
  // перетаскивания узлов.
  const selectedLabel = useAppSelector((s) => {
    if (!selectedNodeId) return null;
    const n = s.graph.data.nodes.find((x) => x.id === selectedNodeId);
    return n?.type === "product" ? String(n.data?.label ?? "") || null : null;
  });
  const { config } = useAiConfig();

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(graphId));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [today, setToday] = useState(requestsToday);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Другой граф — свой разговор.
  const loadedFor = useRef(graphId);
  useEffect(() => {
    if (loadedFor.current === graphId) return;
    loadedFor.current = graphId;
    abortRef.current?.abort();
    setMessages(loadConversation(graphId));
  }, [graphId]);

  useEffect(() => {
    saveConversation(loadedFor.current, messages);
  }, [messages]);

  // Новое сообщение и ход работы — в поле зрения.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, live]);

  // Панель закрыли посреди ответа — запрос к модели больше не нужен.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const { nodes, edges } = store.getState().graph.data;
      const graph = buildChatSlice(nodes, edges, { name: graphName, selectedNodeId });
      const before = messages;
      setMessages([...before, { id: newId(), role: "user", content: message }]);
      setInput("");
      setBusy(true);
      setLive([]);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let reply: ChatMessage;
      try {
        const done = await streamChat(
          { message, history: historyFor(before), graph, ...getAiRequestFields() },
          (e) => {
            if (e.type === "tool") setLive((l) => [...l, e.summary]);
          },
          ctrl.signal,
        );
        addRequestsToday(done.usage.requests);
        reply = {
          id: newId(),
          role: "assistant",
          content: done.reply || "Модель ничего не ответила — спросите иначе.",
          tools: done.tools.map((t) => t.summary),
          proposals: done.proposals,
          requests: done.usage.requests,
        };
      } catch (e) {
        const stopped = ctrl.signal.aborted;
        reply = {
          id: newId(),
          role: "assistant",
          content: stopped
            ? "Остановлено."
            : e instanceof ChatUnavailableError
              ? e.message
              : `Не получилось: ${e instanceof Error ? e.message : String(e)}`,
          error: true,
        };
      }
      if (abortRef.current === ctrl) abortRef.current = null;
      setMessages((m) => [...m, reply]);
      setLive([]);
      setBusy(false);
      setToday(requestsToday());
    },
    [busy, graphName, messages, selectedNodeId, store],
  );

  const closeProposal = (msgId: string, index: number) =>
    setMessages((list) =>
      list.map((m) => (m.id === msgId ? { ...m, closed: [...(m.closed ?? []), index] } : m)),
    );

  const nodeExists = (id: string) => store.getState().graph.data.nodes.some((n) => n.id === id);

  const runProposal = (msgId: string, index: number, p: ChatProposal) => {
    if (p.kind === "step") {
      if (!nodeExists(p.nodeId)) {
        showToast("error", `Узла «${p.label}» уже нет на графе`);
        return;
      }
      requestStep(p.nodeId, p.label, p.direction);
      closeProposal(msgId, index);
    } else {
      const ids = p.nodes.map((n) => n.id).filter(nodeExists);
      if (!ids.length) {
        showToast("error", "Этих узлов уже нет на графе");
        return;
      }
      showNodes(ids);
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  const conversationRequests = messages.reduce((n, m) => n + (m.requests ?? 0), 0);

  return (
    <aside className={styles.panel} aria-label="Чат с ИИ">
      <header className={styles.header}>
        <span className={styles.avatar}>
          <ChatIcon size={20} />
        </span>
        <div className={styles.headerText}>
          <div className={styles.title}>Чат с ИИ</div>
          <div className={styles.subtitle}>{graphName ? `Граф «${graphName}»` : "Несохранённый граф"}</div>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={clear}
          disabled={!messages.length && !busy}
          aria-label="Новый разговор"
          data-tooltip="Новый разговор"
        >
          <TrashIcon size={18} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрыть чат">
          <CloseIcon size={18} />
        </button>
      </header>

      <div className={styles.list} ref={listRef}>
        {!messages.length && !busy && (
          <div className={styles.empty}>
            <p>
              Спросите о продуктах и технологиях — ИИ посмотрит базу справочников ИТС, графы библиотеки
              и этот граф, ответит со ссылками и предложит шаги. Граф меняете вы: предложение открывает
              обычный мастер шага.
            </p>
            {selectedLabel &&
              EXAMPLES.map((q) => (
                <button key={q} type="button" className={styles.example} onClick={() => setInput(q)}>
                  {q}
                </button>
              ))}
            {!selectedLabel && <p className={styles.hint}>Выберите продукт на графе — вопросы «об этом продукте» будут о нём.</p>}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className={styles.user}>
              {m.content}
            </div>
          ) : (
            <div key={m.id} className={`${styles.assistant} ${m.error ? styles.error : ""}`}>
              {!!m.tools?.length && (
                <details className={styles.tools}>
                  <summary>Что смотрел ИИ ({m.tools.length})</summary>
                  <ul>
                    {m.tools.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
              {m.proposals?.map((p, i) =>
                m.closed?.includes(i) ? null : (
                  <div key={i} className={styles.proposal}>
                    {p.kind === "step" ? (
                      <>
                        <div className={styles.proposalTitle}>
                          Шаг {DIR[p.direction]} от «{p.label}»
                        </div>
                        {p.why && <div className={styles.proposalWhy}>{p.why}</div>}
                      </>
                    ) : (
                      <div className={styles.proposalTitle}>
                        Показать на графе: {p.nodes.map((n) => `«${n.label}»`).join(", ")}
                      </div>
                    )}
                    <div className={styles.proposalActions}>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => runProposal(m.id, i, p)}
                        disabled={readOnly && p.kind === "step"}
                      >
                        {p.kind === "step" ? "Построить шаг" : "Показать"}
                      </button>
                      <button type="button" className={styles.secondary} onClick={() => closeProposal(m.id, i)}>
                        {p.kind === "step" ? "Отклонить" : "Скрыть"}
                      </button>
                    </div>
                  </div>
                ),
              )}
              {!!m.requests && (
                <div className={styles.meta}>
                  {m.requests} {plural(m.requests, "запрос", "запроса", "запросов")} к модели
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className={`${styles.assistant} ${styles.pending}`} aria-live="polite">
            {live.map((t, i) => (
              <div key={i} className={styles.liveLine}>
                {t}
              </div>
            ))}
            <div className={styles.thinking}>Думаю…</div>
          </div>
        )}
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {selectedLabel && <div className={styles.context}>О выбранном узле: «{selectedLabel}»</div>}
        <div className={styles.inputRow}>
          <textarea
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter — отправить, Shift+Enter — новая строка.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Спросите о продукте или попросите достроить цепочку"
            rows={2}
            aria-label="Сообщение для ИИ"
          />
          {busy ? (
            <button type="button" className={styles.stop} onClick={() => abortRef.current?.abort()}>
              Стоп
            </button>
          ) : (
            <button type="submit" className={styles.send} disabled={!input.trim()} aria-label="Отправить">
              <SendIcon size={18} />
            </button>
          )}
        </div>
        <div className={styles.footnote}>
          {config.model || config.provider} · запросов к модели: в разговоре {conversationRequests}, сегодня {today}
        </div>
      </form>
    </aside>
  );
});

ChatPanel.displayName = "ChatPanel";
