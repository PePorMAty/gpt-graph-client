import type { FC } from "react";
import type { DirectionTabProps } from "./types";
import styles from "./FlowPanel.module.css";

type StepByStepContentProps = Pick<
  DirectionTabProps,
  | "stepChainStatus"
  | "stepChainError"
  | "stepChainStepCount"
  | "stepChainCurrentProductLabel"
  | "stepChainInsufficientProducts"
  | "onFetchNextStep"
  | "onUndoStep"
  | "stepChainBranchOptions"
  | "onSelectBranch"
  | "onFetchStepSources"
  | "stepSourcesLoading"
>;

export const StepByStepContent: FC<StepByStepContentProps> = ({
  stepChainStatus,
  stepChainError,
  stepChainStepCount = 0,
  stepChainCurrentProductLabel,
  stepChainInsufficientProducts,
  onFetchNextStep,
  onUndoStep,
  stepChainBranchOptions,
  onSelectBranch,
  onFetchStepSources,
  stepSourcesLoading,
}) => {
  const isLoading = stepChainStatus === "loading";
  const isFetchingSources = stepChainStatus === "fetching-sources";
  const hasSteps = stepChainStepCount > 0;
  const isNeedsSources = stepChainStatus === "needs-sources";

  return (
    <div className={styles.formGroup}>
      {isLoading && (
        <div className={styles.tabLoader}>
          <div className={styles.tabSpinner} />
          <span>Запрос следующего шага...</span>
        </div>
      )}

      {/* Current product info */}
      <div className={styles.sourcesTitle}>
        Текущий продукт:{" "}
        <b>{stepChainCurrentProductLabel || "—"}</b>
      </div>

      <div className={styles.sourcesTitle}>
        Шагов выполнено: <b>{stepChainStepCount}</b>
      </div>

      {/* Branch selection */}
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
                checked={opt.label === stepChainCurrentProductLabel}
                onChange={() => onSelectBranch?.(opt.nodeId)}
              />
              <span className={styles.fieldLabel}>{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Next step button */}
      <button
        type="button"
        onClick={onFetchNextStep}
        disabled={isLoading || isFetchingSources}
        className={styles.findSourcesButton}
      >
        {isLoading ? "Запрос шага..." : "Следующий шаг"}
      </button>

      {/* Undo button */}
      {hasSteps && (
        <button
          type="button"
          onClick={onUndoStep}
          disabled={isLoading}
          className={styles.findSourcesButton}
          style={{ marginTop: 4 }}
        >
          Отменить последний шаг
        </button>
      )}

      {/* Fetching sources loader */}
      {isFetchingSources && (
        <div className={styles.tabLoader}>
          <div className={styles.tabSpinner} />
          <span>Поиск источников для «{stepChainCurrentProductLabel}»...</span>
        </div>
      )}

      {/* Needs sources warning + fetch button */}
      {isNeedsSources && (
        <>
          {stepChainInsufficientProducts &&
            stepChainInsufficientProducts.length > 0 && (
              <div className={styles.warningText}>
                Недостаточно источников для:{" "}
                {stepChainInsufficientProducts.join(", ")}
              </div>
            )}
          <button
            type="button"
            onClick={onFetchStepSources}
            disabled={stepSourcesLoading}
            className={styles.findSourcesButton}
            style={{ marginTop: 8 }}
          >
            Найти источники для «{stepChainCurrentProductLabel}»
          </button>
        </>
      )}

      {/* Error */}
      {stepChainError && (
        <div className={styles.errorText}>Ошибка: {stepChainError}</div>
      )}
    </div>
  );
};
