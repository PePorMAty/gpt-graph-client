// src/components/step-check/StepCheckNotice.tsx
//
// Итог проверки шага моделью (store/api/step-check-api.ts): шаг верен, его
// можно исправить переименованием или он ошибочен. Одна и та же плашка — на
// превью построенного шага и в отказе расчёта материального баланса; что
// значит «исправить» (шаг превью или узлы графа), решает тот, кто её показал.

import type { FC, ReactNode } from "react";

import type { StepCheckResult } from "../../store/api/step-check-api";
import { InfoIcon, ShieldCheckIcon } from "../icons";
import wiz from "../flow-panel/StepWizard.module.css";
import css from "./StepCheckNotice.module.css";

export type StepCheckState =
  | { status: "loading" }
  | { status: "failed"; error: string }
  | { status: "done"; result: StepCheckResult };

interface Props {
  state: StepCheckState;
  /** Название преобразования до исправления — для строки «было → стало». */
  transformationName: string;
  /** Исправление уже применено. */
  applied?: boolean;
  /** Применяется (опознание новых названий по справочнику). */
  applying?: boolean;
  onApply?: () => void;
  applyLabel?: string;
  onRetry?: () => void;
  /** Что делать, если шаг ошибочен и переименованием его не исправить. */
  wrongHint?: ReactNode;
  /** Что делать после исправления. */
  appliedHint?: ReactNode;
  /** Что делать, если шаг верен (замечание, с которым проверка не согласна). */
  okHint?: ReactNode;
}

export const StepCheckNotice: FC<Props> = ({
  state,
  transformationName,
  applied = false,
  applying = false,
  onApply,
  applyLabel = "Исправить",
  onRetry,
  wrongHint,
  appliedHint,
  okHint,
}) => {
  if (state.status === "loading") {
    return (
      <div className={css.pending} role="status">
        <span className={css.spinner} aria-hidden />
        Проверяем шаг: получают ли из этого сырья эти продукты…
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className={css.muted}>
        Шаг не проверен: {state.error}.
        {onRetry && (
          <button type="button" className={css.link} onClick={onRetry}>
            Проверить ещё раз
          </button>
        )}
      </div>
    );
  }

  const { verdict, summary, renames, transformation } = state.result;
  const changes = (
    <ul className={css.changes}>
      {renames.map((r) => (
        <li key={r.from}>
          «{r.from}» → <b>«{r.to}»</b>
        </li>
      ))}
      {transformation && (
        <li>
          Преобразование: «{transformationName}» → <b>«{transformation.name}»</b>
        </li>
      )}
    </ul>
  );

  if (verdict === "ok") {
    return (
      <div className={css.ok} role="status">
        <div className={css.head}>
          <ShieldCheckIcon size={16} className={css.icon} />
          <span>
            <b>Проверка: шаг верен.</b> {summary}
          </span>
        </div>
        {okHint}
      </div>
    );
  }

  if (verdict === "fix" && applied) {
    return (
      <div className={css.ok} role="status">
        <div className={css.head}>
          <ShieldCheckIcon size={16} className={css.icon} />
          <b>Исправлено по проверке:</b>
        </div>
        {changes}
        {appliedHint}
      </div>
    );
  }

  return (
    <div className={css.warn} role="alert">
      <div className={css.head}>
        <InfoIcon size={16} className={css.icon} />
        <span>
          <b>{verdict === "fix" ? "Проверка нашла ошибку в шаге." : "Проверка считает шаг ошибочным."}</b>{" "}
          {summary}
        </span>
      </div>
      {verdict === "fix" ? (
        <>
          {changes}
          {onApply && (
            <div className={css.actions}>
              <button type="button" className={wiz.primary} onClick={onApply} disabled={applying}>
                {applying ? "Исправляем…" : applyLabel}
              </button>
            </div>
          )}
        </>
      ) : (
        wrongHint
      )}
    </div>
  );
};
