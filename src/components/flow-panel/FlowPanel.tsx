import { useEffect, useMemo, useRef, type FC } from "react";
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

  chainLoading,
  chainError,

  chainReady,
  onInitChain,
  chainPid,
  producerOptions,
  selectedProducerId,
  onSelectProducer,
  onExpandLevel,
  onExpandNext,

  builtProducerIds,
  selectedAlreadyBuilt,
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

  const builtSet = useMemo(
    () => new Set((builtProducerIds || []).filter(Boolean)),
    [builtProducerIds],
  );
  const producers = Array.isArray(producerOptions) ? producerOptions : [];
  const availableProducerIds = useMemo(
    () => producers.map((p) => p.trId).filter((id) => !builtSet.has(id)),
    [producers, builtSet],
  );

  if (!isOpen) return null;

  const isProduct = nodeType === "product";
  const hasSources = Array.isArray(sources) && sources.length > 0;

  const hasProducerChoices = producers.length > 0;

  const hasAnyAvailable = availableProducerIds.length > 0;

  // “Строить” можно только если:
  // - chain готов
  // - есть producer'ы
  // - выбранный producer ещё не построен
  // - есть хоть один доступный producer вообще
  const canBuildSelected =
    !!chainReady &&
    hasProducerChoices &&
    !!selectedProducerId &&
    !builtSet.has(selectedProducerId) &&
    hasAnyAvailable &&
    !chainLoading;

  // на всякий случай — если выбрали уже построенный (например из-за старого producerByPid)
  const selectedIsBuilt =
    !!selectedProducerId && builtSet.has(selectedProducerId);

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        {(sourcesLoading || aggregateLoading || chainLoading) && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner}></div>
            <p>
              {sourcesLoading
                ? "Поиск источников..."
                : aggregateLoading
                  ? "Обобщение источников..."
                  : "Построение chain..."}
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
              {/* 1) НЕТ ИСТОЧНИКОВ -> выбор направления + поиск */}
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

              {/* 2) ИСТОЧНИКИ ЕСТЬ -> "Обобщить" */}
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

              {/* 3) CHAIN */}
              {isProduct && (
                <>
                  {/* init chain */}
                  {!chainReady && hasSources && hasAggregated && (
                    <>
                      <div className={styles.sourcesTitle}>
                        ✅ Обобщение готово
                      </div>
                      <button
                        type="button"
                        onClick={onInitChain}
                        disabled={
                          sourcesLoading || aggregateLoading || chainLoading
                        }
                        className={styles.findSourcesButton}
                      >
                        🧬 Получить цепочку (chain)
                      </button>
                      {chainError && (
                        <div className={styles.errorText}>
                          Ошибка: {chainError}
                        </div>
                      )}
                    </>
                  )}

                  {/* chain ready -> choose producer + build level */}
                  {chainReady && (
                    <>
                      <div className={styles.sourcesTitle}>
                        🧭 Построение уровня для: <b>{chainPid || "—"}</b>
                      </div>

                      {/* выбор маршрута */}
                      {hasProducerChoices ? (
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>
                            Маршрут (основной/альтернативы):
                          </label>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {producers.map((p, idx) => {
                              const isMain = idx === 0;
                              const isSelected = selectedProducerId === p.trId;
                              const isBuilt = builtSet.has(p.trId);

                              const title = p.title?.trim()
                                ? p.title.trim()
                                : isMain
                                  ? "Основной путь"
                                  : `Альтернатива ${idx}`;

                              return (
                                <button
                                  key={p.trId}
                                  type="button"
                                  className={`${styles.smallBtn} ${
                                    isSelected ? styles.smallBtnActive : ""
                                  }`}
                                  onClick={() => onSelectProducer?.(p.trId)}
                                  disabled={isBuilt} // выбрать уже построенный нельзя (чтобы не путаться)
                                  title={
                                    isBuilt
                                      ? "Этот маршрут уже построен для данного продукта"
                                      : ""
                                  }
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                  }}
                                >
                                  <span>
                                    {isBuilt ? "🔒 " : isSelected ? "✅ " : ""}
                                    {title}
                                  </span>
                                  <span style={{ opacity: 0.65, fontSize: 12 }}>
                                    {p.trId}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          <div
                            className={styles.sourcesTitle}
                            style={{
                              fontSize: 12,
                              opacity: 0.8,
                              marginTop: 10,
                            }}
                          >
                            Доступно: <b>{availableProducerIds.length}</b> /
                            Всего: <b>{producers.length}</b>
                          </div>

                          {!hasAnyAvailable && (
                            <div
                              className={styles.sourcesTitle}
                              style={{
                                fontSize: 12,
                                opacity: 0.8,
                                marginTop: 6,
                              }}
                            >
                              ✅ Все варианты для этого продукта уже построены.
                            </div>
                          )}

                          {selectedIsBuilt && (
                            <div
                              className={styles.sourcesTitle}
                              style={{
                                fontSize: 12,
                                opacity: 0.8,
                                marginTop: 6,
                              }}
                            >
                              Выбран уже построенный маршрут — выбери другой,
                              чтобы продолжить.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={styles.sourcesTitle}
                          style={{ fontSize: 12, opacity: 0.8 }}
                        >
                          Для этого продукта нет доступных producer-узлов
                          (скорее всего это сырьё/исток, уровень не
                          раскрывается).
                        </div>
                      )}

                      {/* build */}
                      <button
                        type="button"
                        onClick={onExpandLevel}
                        disabled={!canBuildSelected}
                        className={styles.findSourcesButton}
                        title={
                          !chainReady
                            ? "Сначала получите chain"
                            : !hasProducerChoices
                              ? "Нет producer-узлов для построения"
                              : !hasAnyAvailable
                                ? "Все варианты уже построены"
                                : selectedAlreadyBuilt
                                  ? "Выбранный вариант уже построен"
                                  : ""
                        }
                      >
                        {!chainReady
                          ? "➕ Построить 1 уровень"
                          : !hasProducerChoices
                            ? "⛔ Нечего строить"
                            : !hasAnyAvailable
                              ? "✅ Всё построено"
                              : selectedAlreadyBuilt
                                ? "✅ Уже построено"
                                : "➕ Построить 1 уровень"}
                      </button>

                      {/* queue */}
                      {onExpandNext && (
                        <button
                          type="button"
                          onClick={onExpandNext}
                          disabled={chainLoading || !hasAnyAvailable}
                          className={styles.findSourcesButton}
                          title={
                            !hasAnyAvailable ? "Все варианты уже построены" : ""
                          }
                        >
                          ▶️ Раскрыть следующий (queue)
                        </button>
                      )}

                      {chainError && (
                        <div className={styles.errorText}>
                          Ошибка: {chainError}
                        </div>
                      )}
                    </>
                  )}

                  {!chainReady && !(hasSources && hasAggregated) && (
                    <div
                      className={styles.sourcesTitle}
                      style={{ fontSize: 12, opacity: 0.7 }}
                    >
                      Чтобы построить chain: Найти источники → Обобщить
                      источники → Получить chain.
                    </div>
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
