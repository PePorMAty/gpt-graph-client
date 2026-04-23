import { useEffect, useMemo, useState, type FC } from "react";
import type { DirectionTabProps } from "./types";
import { StepPreviewModal } from "./StepPreviewModal";
import { parseAlternatives } from "../../utils/parseAlternatives";
import styles from "./FlowPanel.module.css";

type StepByStepContentProps = Pick<
  DirectionTabProps,
  | "stepChainStatus"
  | "stepChainError"
  | "stepChainStepCount"
  | "stepChainCurrentProductLabel"
  | "stepChainInsufficientProducts"
  | "onUndoStep"
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
  stepChainStatus,
  stepChainError,
  stepChainStepCount = 0,
  stepChainCurrentProductLabel,
  stepChainInsufficientProducts,
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
  const buildNeedsSources = stepChainStatus === "needs-sources";
  const showPreview =
    !!pendingStep && stepBuildStatus === "succeeded" && !buildNeedsSources;

  const alternatives = useMemo(
    () => (hasValidAggregate ? parseAlternatives(stepAggregatedText ?? "") : []),
    [hasValidAggregate, stepAggregatedText],
  );
  const hasMultipleAlternatives = alternatives.length > 1;
  const [selectedAltIdx, setSelectedAltIdx] = useState(0);

  useEffect(() => {
    setSelectedAltIdx(0);
  }, [stepAggregatedText]);

  const handleBuildClick = () => {
    if (hasMultipleAlternatives) {
      const chosen = alternatives[selectedAltIdx];
      onBuildStep?.(chosen.fullDescription);
    } else {
      onBuildStep?.();
    }
  };

  return (
    <div className={styles.formGroup}>
      <div className={styles.sourcesTitle}>
        Текущий продукт: <b>{stepChainCurrentProductLabel || "—"}</b>
      </div>
      <div className={styles.sourcesTitle}>
        Шагов выполнено: <b>{stepChainStepCount}</b>
      </div>

      {/* Stage 1: fetch sources button (when no sources yet) */}
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

      {/* Aggregate / re-fetch buttons — only when sources exist and aggregate not yet */}
      {hasSources && !hasValidAggregate && !stepNeedsSources && (
        <>
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
            {sourcesLoading ? "Поиск..." : "Добрать источники"}
          </button>
          {stepAggregateError && (
            <div className={styles.errorText}>
              Ошибка: {stepAggregateError}
            </div>
          )}
        </>
      )}

      {/* Stage: needs more sources */}
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

      {/* Stage: aggregated ready → alt selection + build */}
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

          {hasMultipleAlternatives && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Выберите альтернативу ({alternatives.length}):
              </label>
              {alternatives.map((alt, idx) => (
                <label key={idx} className={styles.fieldCheckbox}>
                  <input
                    type="radio"
                    name="stepAlternative"
                    checked={idx === selectedAltIdx}
                    onChange={() => setSelectedAltIdx(idx)}
                  />
                  <span className={styles.fieldLabel}>
                    {alt.firstStepName || alt.title}
                  </span>
                </label>
              ))}
            </div>
          )}

          {buildLoading && (
            <div className={styles.tabLoader}>
              <div className={styles.tabSpinner} />
              <span>Построение шага...</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleBuildClick}
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

      {/* Build returned "insufficient sources" for new products */}
      {buildNeedsSources &&
        stepChainInsufficientProducts &&
        stepChainInsufficientProducts.length > 0 && (
          <div className={styles.warningText}>
            Для продолжения цепочки нужны дополнительные источники
            {` для: ${stepChainInsufficientProducts.join(", ")}`}.
            Откройте панель этих продуктов и выполните поиск источников.
          </div>
        )}

      {/* Sources list — always visible BELOW description when any sources exist */}
      {hasSources && (
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
      )}

      {/* Reset */}
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

      {stepChainError && (
        <div className={styles.errorText}>Ошибка: {stepChainError}</div>
      )}

      {showPreview && pendingStep && (
        <StepPreviewModal
          step={pendingStep}
          anchorProductName={stepChainCurrentProductLabel ?? ""}
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
