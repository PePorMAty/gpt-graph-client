import type { FC } from "react";
import type { DirectionTabProps } from "./types";
import { StepPreviewModal } from "./StepPreviewModal";
import styles from "./FlowPanel.module.css";

type StepByStepContentProps = Pick<
  DirectionTabProps,
  // session / global step-chain state
  | "stepChainStatus"
  | "stepChainError"
  | "stepChainStepCount"
  | "stepChainCurrentProductLabel"
  | "stepChainCurrentProductNodeId"
  | "stepChainInsufficientProducts"
  | "stepChainBranchOptions"
  | "onSelectBranch"
  | "onUndoStep"
  // step v2 per-direction state
  | "stepSources"
  | "stepSourcesStatus"
  | "stepSourcesError"
  | "stepAggregatedText"
  | "stepAggregateStatus"
  | "stepAggregateError"
  | "stepNeedsSources"
  | "stepInsufficientProducts"
  | "stepBuildResult"
  | "stepBuildStatus"
  | "stepBuildError"
  | "pendingStep"
  | "onFetchStepSources"
  | "onAggregateStepSources"
  | "onBuildStep"
  | "onClearStepState"
  | "onAcceptStep"
  | "onRejectStep"
  | "onRetryStep"
>;

export const StepByStepContent: FC<StepByStepContentProps> = ({
  stepChainError,
  stepChainStepCount = 0,
  stepChainCurrentProductLabel,
  stepChainCurrentProductNodeId,
  stepChainBranchOptions,
  onSelectBranch,
  onUndoStep,

  stepSources = [],
  stepSourcesStatus = "idle",
  stepSourcesError,
  stepAggregatedText,
  stepAggregateStatus = "idle",
  stepAggregateError,
  stepNeedsSources = false,
  stepInsufficientProducts,
  stepBuildStatus = "idle",
  stepBuildError,
  pendingStep,

  onFetchStepSources,
  onAggregateStepSources,
  onBuildStep,
  onClearStepState,
  onAcceptStep,
  onRejectStep,
  onRetryStep,
}) => {
  const hasSources = stepSources.length > 0;
  const sourcesLoading = stepSourcesStatus === "loading";
  const aggregateLoading = stepAggregateStatus === "loading";
  const buildLoading = stepBuildStatus === "loading";
  const hasValidAggregate = !!stepAggregatedText && !stepNeedsSources;
  const hasSteps = stepChainStepCount > 0;
  const showPreview = !!pendingStep && stepBuildStatus === "succeeded";

  return (
    <div className={styles.formGroup}>
      {/* Current session info */}
      <div className={styles.sourcesTitle}>
        Текущий продукт: <b>{stepChainCurrentProductLabel || "—"}</b>
      </div>
      <div className={styles.sourcesTitle}>
        Шагов выполнено: <b>{stepChainStepCount}</b>
      </div>

      {/* Branch selection (когда на последнем шаге несколько новых продуктов) */}
      {stepChainBranchOptions && stepChainBranchOptions.length > 1 && (
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            Выберите продукт для продолжения:
          </label>
          {stepChainBranchOptions.map((opt) => (
            <label key={opt.nodeId} className={styles.fieldCheckbox}>
              <input
                type="radio"
                name="stepBranch"
                checked={opt.nodeId === stepChainCurrentProductNodeId}
                onChange={() => onSelectBranch?.(opt.nodeId)}
              />
              <span className={styles.fieldLabel}>{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Stage 1: no sources yet */}
      {!hasSources && (
        <>
          {sourcesLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>
                Поиск источников для «{stepChainCurrentProductLabel}»...
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onFetchStepSources}
            disabled={sourcesLoading}
            className={styles.findSourcesButton}
          >
            {sourcesLoading ? "Поиск..." : "Найти источники (шаг)"}
          </button>
          {stepSourcesError && (
            <div className={styles.errorText}>
              Ошибка: {stepSourcesError}
            </div>
          )}
        </>
      )}

      {/* Stage 2: sources found, not aggregated yet */}
      {hasSources && !stepAggregatedText && (
        <>
          <div className={styles.sourcesBox}>
            <div className={styles.sourcesTitle}>
              Источники ({stepSources.length})
            </div>
            {stepSources.map((s) => (
              <details key={s.url} className={styles.sourceItem}>
                <summary className={styles.sourceSummary}>
                  <span className={styles.sourceTitle}>{s.title}</span>
                </summary>
                <div className={styles.sourceBody}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.sourceLink}
                  >
                    {s.url}
                  </a>
                  <div className={styles.sourceDesc}>
                    {s.technology_description}
                  </div>
                </div>
              </details>
            ))}
          </div>
          {aggregateLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>Обобщение одного шага...</span>
            </div>
          )}
          <button
            type="button"
            onClick={onAggregateStepSources}
            disabled={aggregateLoading || stepSources.length < 1}
            className={styles.findSourcesButton}
          >
            {aggregateLoading ? "Обобщение..." : "Обобщить (один шаг)"}
          </button>
          <button
            type="button"
            onClick={onFetchStepSources}
            disabled={sourcesLoading || aggregateLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 4 }}
          >
            Повторить поиск источников
          </button>
          {stepAggregateError && (
            <div className={styles.errorText}>
              Ошибка: {stepAggregateError}
            </div>
          )}
        </>
      )}

      {/* Stage 2b: needs more sources */}
      {stepNeedsSources && (
        <>
          <div className={styles.warningText}>
            Недостаточно источников
            {stepInsufficientProducts && stepInsufficientProducts.length > 0
              ? ` для: ${stepInsufficientProducts.join(", ")}`
              : ""}
            .
          </div>
          <button
            type="button"
            onClick={onFetchStepSources}
            disabled={sourcesLoading}
            className={styles.findSourcesButton}
          >
            {sourcesLoading
              ? "Поиск..."
              : `Добрать источники для «${stepChainCurrentProductLabel}»`}
          </button>
        </>
      )}

      {/* Stage 3: aggregated markdown ready → build step */}
      {hasValidAggregate && (
        <>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Обобщённое описание шага:
            </label>
            <textarea
              readOnly
              value={stepAggregatedText ?? ""}
              className={styles.directionTextarea}
              rows={6}
            />
          </div>
          {buildLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>Построение шага...</span>
            </div>
          )}
          <button
            type="button"
            onClick={onBuildStep}
            disabled={buildLoading}
            className={styles.findSourcesButton}
          >
            {buildLoading ? "Построение..." : "Построить шаг"}
          </button>
          <button
            type="button"
            onClick={onAggregateStepSources}
            disabled={aggregateLoading || buildLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 4 }}
          >
            Переобобщить (свежий шаг)
          </button>
          {stepBuildError && (
            <div className={styles.errorText}>Ошибка: {stepBuildError}</div>
          )}
        </>
      )}

      {/* Reset step pipeline (start fresh cycle) */}
      {(hasSources || hasValidAggregate) && (
        <button
          type="button"
          onClick={onClearStepState}
          disabled={sourcesLoading || aggregateLoading || buildLoading}
          className={styles.findSourcesButton}
          style={{ marginTop: 8 }}
        >
          Сбросить и начать шаг заново
        </button>
      )}

      {/* Undo last applied step */}
      {hasSteps && (
        <button
          type="button"
          onClick={onUndoStep}
          className={styles.findSourcesButton}
          style={{ marginTop: 8 }}
        >
          Отменить последний шаг
        </button>
      )}

      {/* Session error */}
      {stepChainError && (
        <div className={styles.errorText}>Ошибка: {stepChainError}</div>
      )}

      {/* Preview modal */}
      {showPreview && pendingStep && (
        <StepPreviewModal
          step={pendingStep}
          stepNumber={stepChainStepCount + 1}
          onAccept={(filteredStep) =>
            onAcceptStep?.(undefined, filteredStep)
          }
          onRetry={() => onRetryStep?.()}
          onReject={() => onRejectStep?.()}
        />
      )}
    </div>
  );
};
