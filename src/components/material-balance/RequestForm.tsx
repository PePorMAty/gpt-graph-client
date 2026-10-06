import { useEffect, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  draftAmount,
  loadBalancePrompt,
  lookupBalanceFor,
  lookupKey,
  runMaterialBalance,
  setBalanceDraft,
  setBalancePrompt,
  takeBalanceFromBase,
} from "../../store/slices/materialBalanceSlice";
import { formatWhen, STATUS_TEXT } from "../../utils/materialBalance";
import type { CustomNode } from "../../types";
import { AiModelSelect } from "../ai-model-select";
import { BasisFields } from "./BasisFields";
import styles from "./MaterialBalance.module.css";

const label = (n: CustomNode) => String(n.data?.label ?? "").trim();

interface Props {
  transformationId: string;
  basis: CustomNode;
  target: CustomNode;
  /** У пары уже есть расчёт: кнопка «Рассчитать заново» и «Отмена». */
  hasCalc: boolean;
  onCancel?: () => void;
}

/**
 * Запрос расчёта для выбранной пары: базис показа, свои данные, промпт и
 * модель, подсказки базы и «Рассчитать».
 */
export const RequestForm: FC<Props> = ({
  transformationId,
  basis,
  target,
  hasCalc,
  onCancel,
}) => {
  const dispatch = useAppDispatch();
  const { draft, prompt, defaults, lookups, jobs } = useAppSelector(
    (s) => s.materialBalance,
  );
  const [showKnown, setShowKnown] = useState(() => draft.knownData.trim() !== "");
  const [showPrompt, setShowPrompt] = useState(false);

  const job = jobs[transformationId];
  const running = job?.status === "running" || job?.status === "starting";
  const lookup = lookups[lookupKey(transformationId, basis.id, target.id)];

  // Есть ли в базе готовое для этой пары.
  useEffect(() => {
    dispatch(
      lookupBalanceFor({ transformationId, basisId: basis.id, targetId: target.id }),
    );
  }, [dispatch, transformationId, basis.id, target.id]);

  useEffect(() => {
    if (showPrompt && !defaults) dispatch(loadBalancePrompt());
  }, [showPrompt, defaults, dispatch]);

  const promptEdited = prompt.system !== null || prompt.template !== null;
  const promptEmpty =
    (prompt.system !== null && !prompt.system.trim()) ||
    (prompt.template !== null && !prompt.template.trim());

  return (
    <div className={styles.form}>
      <div className={styles.basisRow}>
        <BasisFields
          view={{ amount: draftAmount(draft.amount), unit: draft.unit, ref: draft.ref }}
          names={{ P1: label(basis), P2: label(target) }}
          onChange={(view) =>
            dispatch(
              setBalanceDraft({
                amount: String(view.amount),
                unit: view.unit,
                ref: view.ref === "P2" ? "P2" : "P1",
              }),
            )
          }
        />
        <p className={styles.basisNote}>
          В чём показать результат. Модель всегда считает на 1 т исходного
          продукта, поэтому количество, единицу и продукт потом можно менять
          без нового запроса.
        </p>
      </div>

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
            Шаблон запроса — {"<<<…>>>"} сервер заполнит продуктами, базисом и контекстом
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

      {!hasCalc && lookup?.status === "done" && lookup.exact && (
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

      {hasCalc && (
        <p className={styles.note}>
          Новый ответ модели может отличаться от прежнего: она заново ищет
          источники. Чтобы сменить единицы или базис, новый расчёт не нужен.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={running || promptEmpty}
          onClick={() => dispatch(runMaterialBalance({ force: hasCalc }))}
        >
          {hasCalc ? "Рассчитать заново" : "Рассчитать"}
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
