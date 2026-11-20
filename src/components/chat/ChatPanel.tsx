// Чат с ИИ в открытом графе (PG-MIGRATION.md, этап 4) — панель справа от
// полотна, рядом с карточкой узла (та открывается слева).
//
// Что делает модель: смотрит базу (карточка продукта, поиск по ИТС, расчёты
// баланса) и открытый граф, отвечает со ссылками и называет действия: шаг,
// показ, коды, баланс, описание, переименование, объединение, новый продукт.
// Каждое действие ведёт в то, что на сайте уже есть (chatRunner.ts).
//
// Два режима (4.4), переключаются в панели:
// - с подтверждением — действие карточкой с кнопкой; шаг мастер проходит сам
//   до превью, «Добавить шаг» жмёт человек;
// - автопилот — действия ответа выполняются сразу, по очереди; итог уходит
//   модели («Автопилот: …»), и она продолжает задачу, пока не выполнит её
//   или не упрётся в пределы (MAX_AUTO_ROUNDS, MAX_AUTO_STEPS). «Стоп»
//   останавливает всё, вместе с мастером шага.
//
// Граф читается из хранилища только при отправке (store.getState): панель не
// подписана на узлы, и граф на сотни узлов из-за неё не перерисовывается.

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore, type FC } from "react";
import { useStore } from "react-redux";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { RootState } from "../../store/store";
import { useAppSelector } from "../../store/hooks";
import { getAiRequestFields, useAiConfig } from "../../hooks/useAiConfig";
import { buildChatSlice } from "../../utils/chatSlice";
import {
  CHAT_PROPOSAL_KINDS,
  ChatUnavailableError,
  isKnownProposal,
  streamChat,
  type ChatDone,
  type ChatProposal,
} from "../../store/api/chat-api";
import { plural } from "../../utils/plural";
import { showToast } from "../toast/toastStore";
import { ChatIcon, CloseIcon, SendIcon, TrashIcon } from "../icons";
import { cancelAutoStep, getAutoStepSnapshot, subscribeAutoStep } from "../flow-panel/stepAutopilot";
import {
  addRequestsToday,
  conversationKey,
  historyFor,
  isUnsavedKey,
  loadChatMode,
  loadConversation,
  requestsToday,
  saveChatMode,
  saveConversation,
  type ChatMessage,
} from "./chatStore";
import { executeProposal, GRAPH_CHANGES, type AppStore, type ChatMode } from "./chatRunner";
import styles from "./ChatPanel.module.css";

const EXAMPLES = [
  "Что это за продукт и где его производят?",
  "Из чего ещё можно получить этот продукт?",
  "Что делают из этого продукта дальше?",
];

/** Кругов «модель → действия → итог модели» на одно сообщение человека в автопилоте. */
const MAX_AUTO_ROUNDS = 4;
/** Шагов на одно сообщение в автопилоте: шаг — 5–10 запросов к модели. */
const MAX_AUTO_STEPS = 6;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const DIR = { up: "вверх", down: "вниз" } as const;
const q = (s: string) => `«${s}»`;

/**
 * Как показать предложение. edits — меняет граф: в режиме чтения кнопка
 * недоступна. keep — только открывает окно или камеру: карточка остаётся,
 * к ней можно вернуться; сделанная правка из разговора уходит.
 */
function proposalView(p: ChatProposal): {
  title: string;
  note?: string;
  action: string;
  edits: boolean;
  keep: boolean;
} {
  switch (p.kind) {
    case "step":
      return { title: `Шаг ${DIR[p.direction]} от ${q(p.label)}`, action: "Построить шаг", edits: true, keep: false };
    case "show":
      return { title: `Показать на графе: ${p.nodes.map((n) => q(n.label)).join(", ")}`, action: "Показать", edits: false, keep: true };
    case "codes":
      return {
        title: `Коды ОКПД2 и ТН ВЭД: ${p.nodes.map((n) => q(n.label)).join(", ")}`,
        action: "Открыть окно кодов",
        edits: true,
        keep: true,
      };
    case "balance":
      return { title: `Материальный баланс: ${q(p.label)}`, action: "Рассчитать", edits: true, keep: true };
    case "tech":
      return { title: `Технологическое описание: ${q(p.label)}`, action: "Открыть описание", edits: false, keep: true };
    case "rename":
      return { title: `Переименовать ${q(p.label)} → ${q(p.newLabel)}`, action: "Переименовать", edits: true, keep: false };
    case "merge":
      return {
        title: `Объединить ${q(p.fromLabel)} с ${q(p.intoLabel)}`,
        note: `Связи ${q(p.fromLabel)} перейдут к ${q(p.intoLabel)}, узел ${q(p.fromLabel)} исчезнет.`,
        action: "Объединить",
        edits: true,
        keep: false,
      };
    case "add":
      return {
        title: `Добавить продукт ${q(p.label)}${p.nearLabel ? ` рядом с ${q(p.nearLabel)}` : ""}`,
        action: "Добавить",
        edits: true,
        keep: false,
      };
    case "sources":
      return {
        title: `Источники для ${q(p.label)} ${DIR[p.direction]}${p.web ? " — поиск в интернете" : ""}`,
        note: p.web ? "Поиск моделью идёт минуты и стоит запросов." : "Сначала разделы базы, нет их — поиск в интернете.",
        action: "Найти источники",
        edits: true,
        keep: true,
      };
    case "delete":
      return {
        title: `Удалить: ${p.nodes.map((n) => q(n.label)).join(", ")}`,
        note: "Узлы исчезнут вместе со связями — назад не вернуть.",
        action: "Удалить",
        edits: true,
        keep: false,
      };
    case "layout":
      return { title: "Разложить граф заново", action: "Разложить", edits: true, keep: false };
    case "alternatives":
      return {
        title: `Альтернативы ${q(p.label)} — ${p.direction === "up" ? "способы получения" : "пути переработки"}`,
        note: "Без построения шага: мастер найдёт источники и обобщит их, варианты встанут на граф фиолетовыми.",
        action: "Найти альтернативы",
        edits: true,
        keep: false,
      };
    case "describe":
      return {
        title: `Описание ${q(p.label)}`,
        note: [p.description, p.industry && `Отрасль: ${p.industry}`, p.mainPurpose && `Назначение: ${p.mainPurpose}`]
          .filter(Boolean)
          .join("\n"),
        action: "Записать",
        edits: true,
        keep: false,
      };
    case "fillcard":
      return {
        title: `Заполнить карточку ${q(p.label)}`,
        note: "«Технологическое описание» заполняет модель отдельным запросом.",
        action: "Заполнить",
        edits: true,
        keep: false,
      };
    case "bookmark":
      return {
        title: `${p.remove ? "Убрать из закладок" : "В закладки"}: ${p.nodes.map((n) => q(n.label)).join(", ")}`,
        action: p.remove ? "Убрать" : "Добавить",
        edits: false,
        keep: false,
      };
  }
}

interface ChatPanelProps {
  onClose: () => void;
  selectedNodeId: string | null;
  readOnly?: boolean;
}

export const ChatPanel: FC<ChatPanelProps> = memo(({ onClose, selectedNodeId, readOnly = false }) => {
  const store = useStore<RootState>() as AppStore;
  const graphId = useAppSelector((s) => s.savedGraphs.openedGraphId);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName) ?? "";
  // Первый узел — имя черновика (chatStore.conversationKey); строка, а не
  // массив узлов: перетаскивание панель не перерисовывает.
  const firstNodeId = useAppSelector((s) => s.graph.data.nodes[0]?.id ?? null);
  const key = conversationKey(graphId, firstNodeId);
  // Подпись выбранного узла — только строка: панель не перерисовывается от
  // перетаскивания узлов.
  const selectedLabel = useAppSelector((s) => {
    if (!selectedNodeId) return null;
    const n = s.graph.data.nodes.find((x) => x.id === selectedNodeId);
    return n?.type === "product" ? String(n.data?.label ?? "") || null : null;
  });
  // Автопилот всё делает сам — на графе только для чтения его нет.
  const [chosenMode, setChosenMode] = useState<ChatMode>(loadChatMode);
  const mode: ChatMode = readOnly ? "confirm" : chosenMode;
  const chooseMode = (m: ChatMode) => {
    setChosenMode(m);
    saveChatMode(m);
  };
  const { config } = useAiConfig();
  // Задание автопилота мастеру шага — этап виден строкой хода.
  const autoRun = useSyncExternalStore(subscribeAutoStep, getAutoStepSnapshot);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(key));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [today, setToday] = useState(requestsToday);
  const abortRef = useRef<AbortController | null>(null);
  // «Стоп» в автопилоте: не только запрос к модели, но и очередь действий.
  const stoppedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Выбранный узел — на момент каждого запроса: автопилот сам выбирает узлы.
  const selectedRef = useRef(selectedNodeId);
  selectedRef.current = selectedNodeId;

  // Другой граф — свой разговор.
  const loadedFor = useRef(key);
  // Растёт, когда на панели другой разговор: ответ, пришедший к прежнему,
  // в новый не дописывается.
  const generation = useRef(0);
  useEffect(() => {
    const prev = loadedFor.current;
    if (prev === key) return;
    loadedFor.current = key;
    const stored = loadConversation(key);
    // Черновик сохранили: тот же граф (первый узел прежний) получил номер —
    // разговор переезжает с ним, и ответ, который ещё идёт, не обрывается.
    if (!stored.length && isUnsavedKey(prev) && prev === conversationKey(null, firstNodeId)) {
      saveConversation(key, messagesRef.current);
      saveConversation(prev, []);
      return;
    }
    generation.current++;
    stoppedRef.current = true;
    abortRef.current?.abort();
    cancelAutoStep();
    setMessages(stored);
  }, [key, firstNodeId]);

  useEffect(() => {
    saveConversation(loadedFor.current, messages);
  }, [messages]);

  // Новое сообщение и ход работы — в поле зрения.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, live]);

  // Панель закрыли посреди ответа — запрос к модели больше не нужен.
  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    cancelAutoStep();
  };

  /**
   * Сообщение человека — и, в автопилоте, круги «действия → итог модели»,
   * пока модель называет действия, меняющие граф. Разговор копится в convo:
   * следующему кругу нужна история с итогами, а setMessages применится
   * только после перерисовки.
   */
  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const gen = generation.current;
      const runMode = mode;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      stoppedRef.current = false;
      setInput("");
      setBusy(true);
      let convo = messagesRef.current;
      let ask: ChatMessage = { id: newId(), role: "user", content: message };
      let steps = 0;
      const show = (next: ChatMessage[]) => {
        convo = next;
        if (generation.current === gen) setMessages(next);
      };

      for (let round = 0; ; round++) {
        const history = historyFor(convo);
        show([...convo, ask]);
        setLive([]);
        const { nodes, edges } = store.getState().graph.data;
        // Последние изменения графа (его история, новые сверху): «построй
        // дальше» модель продолжает от последнего шага.
        const recent = store
          .getState()
          .history.entries.slice(0, 8)
          .map((e) => ({ title: e.title, details: e.details }));
        const graph = buildChatSlice(nodes, edges, { name: graphName, selectedNodeId: selectedRef.current, recent });
        let reply: ChatMessage;
        let done: ChatDone | null = null;
        try {
          done = await streamChat(
            {
              message: ask.content,
              history,
              graph,
              proposals: CHAT_PROPOSAL_KINDS,
              mode: runMode,
              ...(ask.auto ? { continuation: true } : {}),
              ...getAiRequestFields(),
            },
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
          reply = {
            id: newId(),
            role: "assistant",
            content: ctrl.signal.aborted
              ? "Остановлено."
              : e instanceof ChatUnavailableError
                ? e.message
                : `Не получилось: ${e instanceof Error ? e.message : String(e)}`,
            error: true,
          };
        }
        if (generation.current !== gen) break;
        show([...convo, reply]);
        setToday(requestsToday());
        if (!done?.proposals.length || runMode !== "auto" || stoppedRef.current) break;

        // ── Автопилот: действия ответа — по очереди, итог — под карточкой ──
        const results: string[] = [];
        for (const [i, p] of done.proposals.entries()) {
          if (stoppedRef.current || generation.current !== gen) break;
          let outcome: { ok: boolean; text: string };
          if (p.kind === "step" && steps >= MAX_AUTO_STEPS) {
            outcome = { ok: false, text: `шаг от ${q(p.label)} пропущен: на одно сообщение не больше ${MAX_AUTO_STEPS} шагов` };
          } else {
            if (p.kind === "step") steps++;
            setLive([`Автопилот: ${proposalView(p).title}…`]);
            outcome = await executeProposal(p, "auto", store).catch((e: unknown) => ({
              ok: false,
              text: `не вышло: ${e instanceof Error ? e.message : String(e)}`,
            }));
          }
          results.push(outcome.text);
          show(convo.map((m) => (m.id === reply.id ? { ...m, results: { ...m.results, [i]: outcome } } : m)));
        }
        const changed = done.proposals.some((p) => GRAPH_CHANGES.includes(p.kind));
        if (!changed || !results.length || stoppedRef.current || generation.current !== gen) break;
        if (round + 1 >= MAX_AUTO_ROUNDS) {
          show([
            ...convo,
            {
              id: newId(),
              role: "user",
              auto: true,
              content: `Автопилот: ${results.join("; ")}. Остановился: не больше ${MAX_AUTO_ROUNDS} кругов на одно сообщение — напишите «дальше».`,
            },
          ]);
          break;
        }
        // Итог — модели: следующий шаг она строит от того, что получилось.
        ask = { id: newId(), role: "user", auto: true, content: `Автопилот: ${results.join("; ")}.` };
      }
      if (abortRef.current === ctrl) abortRef.current = null;
      setLive([]);
      setBusy(false);
    },
    [busy, graphName, mode, store],
  );

  const closeProposal = (msgId: string, index: number) =>
    setMessages((list) =>
      list.map((m) => (m.id === msgId ? { ...m, closed: [...(m.closed ?? []), index] } : m)),
    );

  /** Кнопка карточки (режим с подтверждением): то же действие, что делает автопилот. */
  const runProposal = (msgId: string, index: number, p: ChatProposal) => {
    if (!proposalView(p).keep) closeProposal(msgId, index);
    void executeProposal(p, "confirm", store).then((r) => {
      if (!r.ok) showToast("error", r.text.charAt(0).toUpperCase() + r.text.slice(1));
    });
  };

  const clear = () => {
    stop();
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

      <div className={styles.modes} role="group" aria-label="Режим чата">
        <button
          type="button"
          className={`${styles.mode} ${mode === "confirm" ? styles.modeOn : ""}`}
          aria-pressed={mode === "confirm"}
          onClick={() => chooseMode("confirm")}
          disabled={busy}
          data-tooltip="ИИ называет действие карточкой, вы подтверждаете кнопкой"
        >
          С подтверждением
        </button>
        <button
          type="button"
          className={`${styles.mode} ${mode === "auto" ? styles.modeOn : ""}`}
          aria-pressed={mode === "auto"}
          onClick={() => chooseMode("auto")}
          disabled={busy || readOnly}
          data-tooltip={readOnly ? "Граф только для чтения" : "ИИ сам строит шаги и правит граф, пока не выполнит задачу"}
        >
          Автопилот
        </button>
      </div>

      <div className={styles.list} ref={listRef}>
        {!messages.length && !busy && (
          <div className={styles.empty}>
            <p>
              Спросите о продуктах и технологиях — ИИ посмотрит базу справочников ИТС, графы библиотеки
              и этот граф и ответит со ссылками. Попросите действие — «построй 2 шага вниз от фенола»,
              «покажи альтернативы», «рассчитай баланс», «добавь продукт».
            </p>
            <p className={styles.hint}>
              {mode === "auto"
                ? `Автопилот: ИИ делает всё сам — строит шаги (мастер проходит этапы и добавляет шаг), правит граф и продолжает, пока не выполнит задачу. На одно сообщение — до ${MAX_AUTO_STEPS} шагов; «Стоп» останавливает.`
                : "С подтверждением: каждое действие — карточка с кнопкой. Шаг мастер проходит сам до превью, «Добавить шаг» нажимаете вы."}
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
            <div key={m.id} className={m.auto ? styles.autoNote : styles.user}>
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
              {m.proposals?.map((p, i) => {
                // Индекс — номер в ответе (closed хранит номера), поэтому
                // незнакомое предложение пропускается здесь, а не фильтром.
                if (m.closed?.includes(i) || !isKnownProposal(p)) return null;
                const v = proposalView(p);
                const why = "why" in p ? p.why : undefined;
                const result = m.results?.[i];
                return (
                  <div key={i} className={styles.proposal}>
                    <div className={styles.proposalTitle}>{v.title}</div>
                    {v.note && !result && <div className={styles.proposalWhy}>{v.note}</div>}
                    {why && <div className={styles.proposalWhy}>{why}</div>}
                    {/* Автопилот уже выполнил — вместо кнопок итог. */}
                    {result ? (
                      <div className={result.ok ? styles.resultOk : styles.resultFail}>
                        {result.ok ? "✓ " : "✗ "}
                        {result.text}
                      </div>
                    ) : (
                      <div className={styles.proposalActions}>
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() => runProposal(m.id, i, p)}
                          disabled={readOnly && v.edits}
                        >
                          {v.action}
                        </button>
                        <button type="button" className={styles.secondary} onClick={() => closeProposal(m.id, i)}>
                          {v.keep ? "Скрыть" : "Отклонить"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
            {/* Скрытый мастер шага автопилота — его этап. */}
            {autoRun?.headless && <div className={styles.liveLine}>мастер шага: {autoRun.stage}</div>}
            <div className={styles.thinking}>{autoRun?.headless ? "Работаю…" : "Думаю…"}</div>
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
            <button type="button" className={styles.stop} onClick={stop}>
              Стоп
            </button>
          ) : (
            <button type="submit" className={styles.send} disabled={!input.trim()} aria-label="Отправить">
              <SendIcon size={18} />
            </button>
          )}
        </div>
        <div className={styles.footnote}>
          {config.model || config.provider} · {mode === "auto" ? "автопилот" : "с подтверждением"} · запросов к
          модели: в разговоре {conversationRequests}, сегодня {today}
        </div>
      </form>
    </aside>
  );
});

ChatPanel.displayName = "ChatPanel";
