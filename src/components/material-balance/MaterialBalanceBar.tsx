import { useEffect, useMemo, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  dismissBalanceJob,
  loadBalancePrompt,
  lookupBalanceFor,
  lookupKey,
  runMaterialBalance,
  selectBalanceTransformation,
  setBalanceDraft,
  setBalanceMode,
  setBalancePair,
  setBalancePrompt,
  setMaterialBalanceView,
  takeBalanceFromBase,
  draftAmount,
} from "../../store/slices/materialBalanceSlice";
import {
  allCalcs,
  balanceEnds,
  calcsOf,
  formatWhen,
  STATUS_TEXT,
} from "../../utils/materialBalance";
import { AiModelSelect } from "../ai-model-select";
import { BasisFields } from "./BasisFields";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, ScalesIcon } from "../icons";
import styles from "./MaterialBalance.module.css";

const label = (n: { data?: { label?: unknown } } | undefined) =>
  String(n?.data?.label ?? "").trim();

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface Props {
  /** Открыть вкладку «Материальный баланс» — список или этот расчёт. */
  onOpenPanel: (target?: { nodeId: string; recordId: number }) => void;
  /** Высота панели над холстом, px: плашка встаёт под ней. 0 — по токену. */
  top?: number;
}

/**
 * Плашка режима «Материальный баланс» над полотном.
 *
 * Пока преобразование не выбрано — подсказка. Выбрано — пара «исходный →
 * целевой», базис, свои данные, промпт с моделью, подсказки базы и кнопка
 * расчёта. Расчёт идёт минуты: плашку можно свернуть и работать дальше, по
 * готовности придёт уведомление.
 */
export const MaterialBalanceBar: FC<Props> = ({ onOpenPanel, top = 0 }) => {
  const dispatch = useAppDispatch();
  const { selection, draft, jobs, lookups, prompt, defaults } = useAppSelector(
    (s) => s.materialBalance,
  );
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const [collapsed, setCollapsed] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const t = selection
    ? nodes.find((n) => n.id === selection.transformationId && n.type === "transformation")
    : undefined;
  const ends = useMemo(
    () => (t ? balanceEnds(t.id, nodes, edges) : { ins: [], outs: [] }),
    [t, nodes, edges],
  );
  const basis = ends.ins.find((n) => n.id === selection?.basisId);
  const target = ends.outs.find((n) => n.id === selection?.targetId);
  const job = t ? jobs[t.id] : undefined;
  const running = job?.status === "running" || job?.status === "starting";
  const lookup =
    t && basis && target ? lookups[lookupKey(t.id, basis.id, target.id)] : undefined;
  const existing =
    t && basis && target
      ? calcsOf(t).find((c) => c.nodeIds.P1 === basis.id && c.nodeIds.P2 === target.id)
      : undefined;
  const calcCount = useMemo(() => allCalcs(nodes).length, [nodes]);

  // Есть ли в базе готовое — как только пара выбрана.
  useEffect(() => {
    if (!t || !basis || !target) return;
    dispatch(
      lookupBalanceFor({ transformationId: t.id, basisId: basis.id, targetId: target.id }),
    );
  }, [dispatch, t?.id, basis?.id, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showPrompt && !defaults) dispatch(loadBalancePrompt());
  }, [showPrompt, defaults, dispatch]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Под фактической панелью над холстом: она бывает и в две строки.
  const wrapStyle = top > 0 ? { top: top + 4 } : undefined;

  const promptEmpty =
    (prompt.system !== null && !prompt.system.trim()) ||
    (prompt.template !== null && !prompt.template.trim());
  const since = job ? elapsed(now - new Date(job.startedAt).getTime()) : "";

  if (collapsed) {
    return (
      <div className={styles.barWrap} style={wrapStyle}>
        <button
          type="button"
          className={styles.barPill}
          onClick={() => setCollapsed(false)}
          aria-label="Развернуть плашку материального баланса"
        >
          <ScalesIcon size={15} />
          Материальный баланс
          {t ? ` · «${label(t)}»` : ""}
          {running ? ` · считаем ${since}` : ""}
          <ChevronDownIcon size={14} />
        </button>
      </div>
    );
  }

  const close = (
    <span className={styles.barHeadActions}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => setCollapsed(true)}
        aria-label="Свернуть"
        title="Свернуть"
      >
        <ChevronUpIcon size={16} />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => dispatch(setBalanceMode(false))}
        aria-label="Выключить режим «Материальный баланс»"
        title="Выключить режим"
      >
        <CloseIcon size={16} />
      </button>
    </span>
  );

  // ── Ничего не выбрано ──
  if (!t) {
    return (
      <div className={styles.barWrap} style={wrapStyle}>
        <div className={styles.bar} role="region" aria-label="Материальный баланс">
          <div className={styles.barHead}>
            <ScalesIcon size={18} className={styles.barIcon} />
            <span className={styles.barHint}>
              Щёлкните преобразование на полотне — посчитаем его материальный
              баланс: сколько продукта получается из сырья.
            </span>
            {close}
          </div>
          {calcCount > 0 && (
            <div className={styles.barRow}>
              <span className={styles.muted}>
                Расчётов на графе: {calcCount}. На узлах — числа последнего.
              </span>
              <button type="button" className={styles.linkBtn} onClick={() => onOpenPanel()}>
                Все расчёты
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Считать не из чего ──
  if (!ends.ins.length || !ends.outs.length) {
    const missing = !ends.ins.length ? "на входе" : "на выходе";
    return (
      <div className={styles.barWrap} style={wrapStyle}>
        <div className={styles.bar} role="region" aria-label="Материальный баланс">
          <div className={styles.barHead}>
            <ScalesIcon size={18} className={styles.barIcon} />
            <span className={styles.barTitle}>«{label(t)}»</span>
            {close}
          </div>
          <p className={styles.warn}>
            У преобразования нет продукта {missing} — баланс считать не из чего.
            Свяжите его с продуктом и выберите снова.
          </p>
          <div className={styles.barRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => dispatch(selectBalanceTransformation(null))}
            >
              Выбрать другое преобразование
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pairSelect = (
    list: typeof ends.ins,
    value: string | undefined,
    onChange: (id: string) => void,
    aria: string,
  ) =>
    list.length > 1 ? (
      <select
        className={styles.select}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={aria}
        disabled={running}
      >
        {list.map((n) => (
          <option key={n.id} value={n.id}>
            {label(n)}
          </option>
        ))}
      </select>
    ) : (
      <span className={styles.pairName}>{label(list[0])}</span>
    );

  const similar = (lookup?.similar ?? []).filter(
    (s) => s.id !== existing?.record.id,
  );

  return (
    <div className={styles.barWrap} style={wrapStyle}>
      <div className={styles.bar} role="region" aria-label="Материальный баланс">
        <div className={styles.barHead}>
          <ScalesIcon size={18} className={styles.barIcon} />
          <span className={styles.pair}>
            {pairSelect(ends.ins, basis?.id, (id) => dispatch(setBalancePair({ basisId: id })), "Исходный продукт")}
            <span className={styles.arrow}>→</span>
            <span className={styles.barTitle}>«{label(t)}»</span>
            <span className={styles.arrow}>→</span>
            {pairSelect(ends.outs, target?.id, (id) => dispatch(setBalancePair({ targetId: id })), "Целевой продукт")}
          </span>
          {close}
        </div>

        <div className={styles.barRow}>
          {/* Расчёт пары уже есть — базис правит его показ, числа на узлах
              меняются сразу. Нет — это базис будущего расчёта. */}
          <BasisFields
            view={
              existing?.view ?? {
                amount: draftAmount(draft.amount),
                unit: draft.unit,
                ref: draft.ref,
              }
            }
            names={{ P1: label(basis), P2: label(target) }}
            onChange={(view) => {
              dispatch(
                setBalanceDraft({
                  amount: String(view.amount),
                  unit: view.unit,
                  ref: view.ref === "P2" ? "P2" : "P1",
                }),
              );
              if (existing) dispatch(setMaterialBalanceView(t.id, existing.record.id, view));
            }}
          />
          <span className={styles.spacer} />
          <button
            type="button"
            className={`${styles.toggle} ${showKnown || draft.knownData.trim() ? styles.toggleOn : ""}`}
            onClick={() => setShowKnown((v) => !v)}
            aria-expanded={showKnown}
          >
            Свои данные{draft.knownData.trim() ? " ✓" : ""}
          </button>
          <button
            type="button"
            className={`${styles.toggle} ${showPrompt || prompt.system !== null || prompt.template !== null ? styles.toggleOn : ""}`}
            onClick={() => setShowPrompt((v) => !v)}
            aria-expanded={showPrompt}
          >
            Изменить промпт{prompt.system !== null || prompt.template !== null ? " ✓" : ""}
          </button>
        </div>

        {showKnown && (
          <div className={styles.block}>
            <textarea
              className={styles.textarea}
              rows={3}
              value={draft.knownData}
              placeholder="Например: конверсия изобутилена 96% по данным завода; метанол подаётся с избытком 10%"
              onChange={(e) => dispatch(setBalanceDraft({ knownData: e.target.value }))}
            />
            <p className={styles.note}>
              Уходит модели как известные данные. С ними расчёт всегда идёт к
              модели заново — готовое из базы не берётся.
            </p>
          </div>
        )}

        {showPrompt && (
          <div className={styles.block}>
            <AiModelSelect stage="search" label="Модель (нужен поиск в интернете):" />
            <label className={styles.fieldLabel} htmlFor="mb-system">
              Системный промпт — правила расчёта
            </label>
            <textarea
              id="mb-system"
              className={`${styles.textarea} ${styles.promptArea}`}
              rows={10}
              readOnly={!defaults}
              value={prompt.system ?? defaults?.system ?? "Загружаем промпт…"}
              onChange={(e) => dispatch(setBalancePrompt({ system: e.target.value }))}
            />
            {prompt.system !== null && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => dispatch(setBalancePrompt({ system: null }))}
              >
                Вернуть системный промпт по умолчанию
              </button>
            )}
            <label className={styles.fieldLabel} htmlFor="mb-template">
              Шаблон запроса — {"<<<…>>>"} сервер заполнит продуктами, базисом и контекстом
            </label>
            <textarea
              id="mb-template"
              className={`${styles.textarea} ${styles.promptArea}`}
              rows={10}
              readOnly={!defaults}
              value={prompt.template ?? defaults?.template ?? "Загружаем промпт…"}
              onChange={(e) => dispatch(setBalancePrompt({ template: e.target.value }))}
            />
            {prompt.template !== null && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => dispatch(setBalancePrompt({ template: null }))}
              >
                Вернуть шаблон по умолчанию
              </button>
            )}
            {promptEmpty && <p className={styles.error}>Промпт не может быть пустым</p>}
            <p className={styles.note}>
              С правленым промптом расчёт всегда идёт к модели заново. Правка
              действует до перезагрузки страницы.
            </p>
          </div>
        )}

        {existing ? (
          <div className={styles.barRow}>
            <span className={styles.muted}>
              В графе: {STATUS_TEXT[existing.record.status]}, {formatWhen(existing.record.createdAt)}
              {existing.fromCache ? " (из базы)" : ""}.
            </span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => onOpenPanel({ nodeId: t.id, recordId: existing.record.id })}
            >
              Подробности
            </button>
          </div>
        ) : lookup?.status === "done" && lookup.exact ? (
          <div className={styles.barRow}>
            <span className={styles.muted}>
              В базе есть готовый расчёт от {formatWhen(lookup.exact.createdAt)} —
              «Рассчитать» возьмёт его сразу, без модели.
            </span>
          </div>
        ) : null}

        {similar.slice(0, 3).map((s) => (
          <div key={s.id} className={styles.barRow}>
            <span className={styles.muted}>
              В базе — расчёт этой пары по технологии «{s.transformation}»,{" "}
              {STATUS_TEXT[s.status].toLowerCase()}, {formatWhen(s.createdAt)}.
            </span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => dispatch(takeBalanceFromBase(s.id))}
            >
              Взять его
            </button>
          </div>
        ))}

        {job?.status === "failed" && (
          <div className={styles.errorBox}>
            <span>Не рассчитан: {job.error}</span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => dispatch(dismissBalanceJob(t.id))}
              aria-label="Скрыть ошибку"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        <div className={styles.barRow}>
          {running ? (
            <span className={styles.running} role="status">
              <span className={styles.spinner} aria-hidden />
              Считаем… {since}. Модель ищет источники — обычно это несколько
              минут. Можно свернуть плашку и работать дальше: по готовности
              придёт уведомление.
            </span>
          ) : (
            <span className={styles.muted}>
              Модель всегда считает на 1 т исходного продукта, а базис можно
              менять потом без нового запроса.
            </span>
          )}
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.primary}
            disabled={running || !basis || !target || promptEmpty}
            onClick={() => dispatch(runMaterialBalance({ force: Boolean(existing) }))}
          >
            {existing ? "Пересчитать" : "Рассчитать"}
          </button>
        </div>
      </div>
    </div>
  );
};
