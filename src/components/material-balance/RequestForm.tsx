import { useEffect, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  jobKey,
  loadBalancePrompt,
  lookupBalanceFor,
  lookupKey,
  runMaterialBalance,
  setBalanceDraft,
  setBalancePrompt,
  takeBalanceFromBase,
} from "../../store/slices/materialBalanceSlice";
import {
  formatWhen,
  STATUS_TEXT,
  type BalanceDirection,
  type MaterialBalanceCalc,
} from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { AiModelSelect } from "../ai-model-select";
import styles from "./MaterialBalance.module.css";

interface Props {
  transformation: CustomNode;
  input: CustomNode;
  output: CustomNode;
  direction: BalanceDirection;
  /** Расчёт этой пары в этом направлении, если он уже есть. */
  existing?: MaterialBalanceCalc;
  onCancel?: () => void;
}

/**
 * Запрос расчёта выбранной пары в направлении вкладки: свои данные, промпт
 * и модель, подсказки базы и «Рассчитать». Количество — в схеме над формой.
 *
 * У пары в направлении хранится один расчёт: если он уже есть, новый его
 * заменит — форма об этом говорит. Расчёты других пар не трогаются.
 */
export const RequestForm: FC<Props> = ({
  transformation,
  input,
  output,
  direction,
  existing,
  onCancel,
}) => {
  const dispatch = useAppDispatch();
  const { draft, prompt, defaults, lookups, jobs } = useAppSelector(
    (s) => s.materialBalance,
  );
  const [showKnown, setShowKnown] = useState(() => draft.knownData.trim() !== "");
  const [showPrompt, setShowPrompt] = useState(false);

  const job = jobs[jobKey(transformation.id, input.id, output.id, direction)];
  const running = job?.status === "running" || job?.status === "starting";
  const lookup = lookups[lookupKey(transformation.id, input.id, output.id, direction)];
  // Пара уже посчитана — «заново» идёт к модели мимо базы: иначе сервер
  // вернул бы тот же готовый ответ.
  const again = Boolean(existing);

  useEffect(() => {
    dispatch(
      lookupBalanceFor({
        transformationId: transformation.id,
        inputId: input.id,
        outputId: output.id,
        direction,
      }),
    );
  }, [dispatch, transformation.id, input.id, output.id, direction]);

  useEffect(() => {
    if (showPrompt && !defaults) dispatch(loadBalancePrompt());
  }, [showPrompt, defaults, dispatch]);

  const promptEdited = prompt.system !== null || prompt.template !== null;
  const promptEmpty =
    (prompt.system !== null && !prompt.system.trim()) ||
    (prompt.template !== null && !prompt.template.trim());

  return (
    <div className={styles.form}>
      <button
        type="button"
        className={`${styles.toggle} ${showKnown || draft.knownData.trim() ? styles.toggleOn : ""}`}
        onClick={() => setShowKnown((v) => !v)}
        aria-expanded={showKnown}
      >
        Свои данные{draft.knownData.trim() ? " ✓" : ""}
      </button>
      {showKnown && (
        <div className={styles.block}>
          <textarea
            className={styles.textarea}
            rows={4}
            value={draft.knownData}
            aria-label="Свои данные"
            placeholder="Например: выход риформата 86% по данным завода; нафта фракции 85–180 °C; давление 1,5 МПа"
            onChange={(e) => dispatch(setBalanceDraft({ knownData: e.target.value }))}
          />
          <p className={styles.note}>
            Что вы знаете сами: выход или конверсию, состав сырья, расход
            реагента, условия процесса, данные своего завода. Текст уходит
            модели разделом «Известные данные»: она считает с ним наравне с
            найденными источниками и в расчёте пишет, где его применила. С
            ними расчёт всегда идёт к модели заново — готовое из базы не
            берётся.
          </p>
        </div>
      )}

      <button
        type="button"
        className={`${styles.toggle} ${showPrompt || promptEdited ? styles.toggleOn : ""}`}
        onClick={() => setShowPrompt((v) => !v)}
        aria-expanded={showPrompt}
      >
        Промпт и модель{promptEdited ? " ✓" : ""}
      </button>
      {showPrompt && (
        <div className={styles.block}>
          <AiModelSelect stage="search" label="Модель (нужен поиск в интернете):" />
          <label className={styles.fieldLabel} htmlFor="mb-system">
            Системный промпт — правила расчёта
          </label>
          <textarea
            id="mb-system"
            className={`${styles.textarea} ${styles.promptArea}`}
            rows={12}
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
            Шаблон запроса — {"<<<…>>>"} сервер заполнит продуктами, базисом,
            направлением и контекстом
          </label>
          <textarea
            id="mb-template"
            className={`${styles.textarea} ${styles.promptArea}`}
            rows={12}
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

      {!again && lookup?.status === "done" && lookup.exact && (
        <p className={styles.note}>
          В базе есть готовый расчёт от {formatWhen(lookup.exact.createdAt)} —
          «Рассчитать» возьмёт его сразу, без модели.
        </p>
      )}
      {(lookup?.similar ?? []).slice(0, 3).map((s) => (
        <div key={s.id} className={styles.hint}>
          <span>
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

      {again && (
        <p className={styles.note}>
          Новый расчёт заменит текущий расчёт этой пары: модель заново ищет
          источники, и числа могут отличаться. Количество и единицу можно
          менять и без нового расчёта.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={running || promptEmpty}
          onClick={() => dispatch(runMaterialBalance({ force: again }))}
        >
          {again ? "Рассчитать заново" : "Рассчитать"}
        </button>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </div>
  );
};
