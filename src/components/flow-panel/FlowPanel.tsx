import { useEffect, useRef, type FC } from "react";
import type { FlowPanelProps } from "./types";
import styles from "./FlowPanel.module.css";

export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  onDelete,
  descriptionValue,
  onChangeDescription,

  nodeType,
  buildDirection,
  onSetBuildDirection,
  onFindSources,
  sourcesLoading,
  sourcesError,
  sources,

  onAggregateSources,
  aggregateLoading,
  aggregateError,
  hasAggregated,

  onBuildChain,
  chainLoading,
  chainError,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  if (!isOpen) return null;

  const isProduct = nodeType === "product";

  const hasSources = Array.isArray(sources) && sources.length > 0;

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        {/* ✅ ЛОАДЕР ТОЛЬКО ВНУТРИ КАРТОЧКИ */}
        {(sourcesLoading || aggregateLoading) && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner}></div>
            <p>
              {sourcesLoading
                ? "Поиск источников..."
                : "Обобщение источников..."}
            </p>
          </div>
        )}

        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Редактирование узла</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.panelContent}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Название узла:</label>
            <input
              value={value}
              onChange={onChangeValue}
              className={styles.formInput}
              placeholder="Введите название узла"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Описание:</label>
            <textarea
              value={descriptionValue}
              onChange={onChangeDescription}
              className={styles.formTextarea}
              placeholder="Введите описание узла"
              rows={4}
            />
          </div>

          {isProduct && (
            <div className={styles.formGroup}>
              {/* ✅ 1) НЕТ ИСТОЧНИКОВ -> выбор направления + поиск */}
              {!hasSources && (
                <>
                  <label className={styles.formLabel}>Куда строить граф:</label>
                  <div className={styles.inlineRow}>
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${
                        buildDirection === "down" ? styles.smallBtnActive : ""
                      }`}
                      onClick={() => onSetBuildDirection?.("down")}
                      disabled={sourcesLoading || aggregateLoading}
                    >
                      {buildDirection === "down"
                        ? "✅ Строим вниз"
                        : "⬇ Строить вниз"}
                    </button>

                    <button
                      type="button"
                      className={`${styles.smallBtn} ${
                        buildDirection === "up" ? styles.smallBtnActive : ""
                      }`}
                      onClick={() => onSetBuildDirection?.("up")}
                      disabled={sourcesLoading || aggregateLoading}
                    >
                      {buildDirection === "up"
                        ? "✅ Строим вверх"
                        : "⬆ Строить вверх"}
                    </button>
                  </div>

                  {buildDirection && (
                    <button
                      type="button"
                      onClick={onFindSources}
                      disabled={sourcesLoading || aggregateLoading}
                      className={styles.findSourcesButton}
                    >
                      🔎 Найти источники
                    </button>
                  )}

                  {sourcesError && (
                    <div className={styles.errorText}>
                      Ошибка: {sourcesError}
                    </div>
                  )}
                </>
              )}

              {/* ✅ 2) ИСТОЧНИКИ ЕСТЬ -> заменить кнопки на "Обобщить" */}
              {hasSources && !hasAggregated && (
                <>
                  <div className={styles.sourcesTitle}>
                    Источники найдены: {sources.length}
                  </div>
                  <button
                    type="button"
                    onClick={onAggregateSources}
                    disabled={sourcesLoading || aggregateLoading}
                    className={styles.findSourcesButton}
                  >
                    🧩 Обобщить источники
                  </button>
                  {aggregateError && (
                    <div className={styles.errorText}>
                      Ошибка: {aggregateError}
                    </div>
                  )}
                </>
              )}

              {/* ✅ 3) ОБОБЩЕНО */}
              {hasSources && hasAggregated && (
                <>
                  <div className={styles.sourcesTitle}>✅ Обобщение готово</div>

                  <button
                    type="button"
                    onClick={onBuildChain}
                    disabled={
                      sourcesLoading || aggregateLoading || chainLoading
                    }
                    className={styles.findSourcesButton}
                  >
                    🧬 Построить граф (1 шаг)
                  </button>

                  {chainError && (
                    <div className={styles.errorText}>Ошибка: {chainError}</div>
                  )}
                </>
              )}
            </div>
          )}

          {isProduct && sources.length > 0 && (
            <div className={styles.sourcesBox}>
              <div className={styles.sourcesTitle}>
                Источники ({sources.length})
              </div>

              {sources.map((s) => (
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

          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={handleDelete}
              className={styles.deleteButton}
            >
              Удалить узел
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
