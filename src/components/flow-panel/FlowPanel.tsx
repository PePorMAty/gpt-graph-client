import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { FlowPanelProps } from "./types";
import type {
  ProductCardProduct,
  ProductCardTechnology,
} from "../../store/types"; // путь подстрой
import { getDefaultFillCardSystemPrompt } from "../../utils/defaultFillCardPrompts";

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
  chainUiEnabled,
  isActiveChainRoot,

  canInitChainHere,
  initChainLabel,
  onInitChain,

  // ⬇️ дальше параметры ДЛЯ queue[0].pid (следующий продукт)
  queueLen,
  chainPid, // это queuePid (следующий pid из очереди)
  producerOptions,
  selectedProducerId,
  onSelectProducer,
  builtProducerIds,

  onExpandNext, // ✅ единственная кнопка построения

  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // --- prompt editor state ---
  const defaultPrompt = getDefaultFillCardSystemPrompt(nodeType || "product");
  const [promptOpen, setPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(defaultPrompt);

  // reset prompt when node or nodeType changes
  useEffect(() => {
    const def = getDefaultFillCardSystemPrompt(nodeType || "product");
    setCustomPrompt(def);
    setPromptOpen(false);
  }, [nodeType]);

  const isPromptModified = customPrompt !== defaultPrompt;

  const handleFillCard = () => {
    onBuildProductCard?.(isPromptModified ? customPrompt : undefined);
  };
  // --- end prompt editor state ---

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

  const isProduct = nodeType === "product";
  const hasSources = Array.isArray(sources) && sources.length > 0;

  function isProductCard(c: unknown): c is ProductCardProduct {
    return !!c && typeof c === "object" && "product_name" in c;
  }

  function isTechCard(c: unknown): c is ProductCardTechnology {
    return !!c && typeof c === "object" && "technology_name" in c;
  }

  const producers = Array.isArray(producerOptions) ? producerOptions : [];
  const builtSet = useMemo(
    () => new Set((builtProducerIds || []).filter(Boolean)),
    [builtProducerIds],
  );

  // ✅ queue-кнопка НЕ зависит от “построено ли у текущего продукта”
  // она зависит только от очереди и от того, что мы в UI корня активной chain-сессии
  const queueHasWork = !!queueLen && queueLen > 0;
  const canQueue =
    !!chainReady &&
    !!chainUiEnabled &&
    !!isActiveChainRoot &&
    !!onExpandNext &&
    queueHasWork &&
    !chainLoading;

  // выбранный producer для queuePid
  const selectedIsBuilt =
    !!selectedProducerId && builtSet.has(selectedProducerId);

  // доступные producers для queuePid
  const hasAnyAvailableProducer = producers.some((p) => !builtSet.has(p.trId));

  // queuePid валиден?
  const hasQueuePid = !!chainPid;

  if (!isOpen) return null;

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
          {/* ✅ PRODUCT CARD */}
          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={() => setPromptOpen((v) => !v)}
              className={styles.promptToggle}
            >
              {promptOpen ? "Скрыть промпт" : "Настроить промпт"}
            </button>

            {promptOpen && (
              <div className={styles.promptEditor}>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className={styles.promptTextarea}
                  rows={12}
                />
                {isPromptModified && (
                  <button
                    type="button"
                    className={styles.promptResetBtn}
                    onClick={() => setCustomPrompt(defaultPrompt)}
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleFillCard}
              disabled={!onBuildProductCard || productCardStatus === "loading"}
              className={styles.findSourcesButton}
            >
              {productCardStatus === "loading"
                ? "🧾 Заполняю карточку..."
                : isPromptModified
                  ? "🧾 Заполнить (свой промпт)"
                  : "🧾 Заполнить карточку"}
            </button>

            {productCardStatus === "failed" && productCardError && (
              <div className={styles.errorText}>Ошибка: {productCardError}</div>
            )}

            {productCardStatus === "succeeded" && productCard && (
              <div className={styles.sourcesBox}>
                <div className={styles.sourcesTitle}>Карточка</div>

                {isProductCard(productCard) && (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      <b>{productCard.product_name}</b> —{" "}
                      {productCard.product_type}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Степень чистоты</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.purity}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Основные примеси</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.main_impurities}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Допустимые примеси</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.allowed_impurities}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Коэффициент конверсии</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.conversion_yield}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Типичный масштаб</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.typical_scale}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Хранение</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.storage}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Углеродный след</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.carbon_footprint}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Производители</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.producers}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Применения</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.applications}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Цена</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.price}
                    </div>
                  </>
                )}

                {isTechCard(productCard) && (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      <b>{productCard.technology_name}</b>
                    </div>

                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {productCard.technology_short_description}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Оборудование</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.equipment}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Условия</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.conditions}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Ограничения / ключевое свойство</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.constraints_or_key_property}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Материалы / катализаторы</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.additional_materials_or_catalysts}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Энергетика</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.energy}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10 }}>
                      <b>Предприятие и завод</b>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {productCard.enterprise_and_plant}
                    </div>
                  </>
                )}

                {!isProductCard(productCard) && !isTechCard(productCard) && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Неизвестный формат карточки (нет ключей product_name /
                    technology_name)
                  </div>
                )}
              </div>
            )}
          </div>
          {isProduct && (
            <div className={styles.formGroup}>
              {/* 1) нет источников -> выбрать направление + поиск */}
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

              {/* 2) источники есть, но не обобщено -> ТОЛЬКО обобщить */}
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

              {/* 3) обобщение готово -> можно получить chain / продолжить */}
              {hasSources && hasAggregated && (
                <>
                  {canInitChainHere && (
                    <button
                      type="button"
                      onClick={onInitChain}
                      disabled={
                        sourcesLoading || aggregateLoading || chainLoading
                      }
                      className={styles.findSourcesButton}
                    >
                      {initChainLabel || "🧬 Получить цепочку (chain)"}
                    </button>
                  )}

                  {/* chain UI показываем только если узел принадлежит активной chain-сессии */}

                  {chainReady && chainUiEnabled && (
                    <>
                      {!isActiveChainRoot && (
                        <div
                          className={styles.sourcesTitle}
                          style={{ fontSize: 12, opacity: 0.75 }}
                        >
                          Продолжение цепочки доступно только в корневом
                          продукте активной цепочки.
                        </div>
                      )}

                      {isActiveChainRoot && (
                        <>
                          <div className={styles.sourcesTitle}>
                            📌 Очередь: <b>{queueLen ?? 0}</b>
                          </div>

                          <div className={styles.sourcesTitle}>
                            Следующий продукт: <b>{chainPid || "—"}</b>
                          </div>

                          <button
                            type="button"
                            onClick={onExpandNext}
                            disabled={!canQueue}
                            className={styles.findSourcesButton}
                            title={
                              !queueHasWork
                                ? "Очередь пустая"
                                : !isActiveChainRoot
                                  ? "Доступно только в корне цепочки"
                                  : ""
                            }
                          >
                            {!queueHasWork
                              ? "✅ Цепочка завершена"
                              : "▶️ Раскрыть следующий (основная цепочка)"}
                          </button>

                          {!queueHasWork && (
                            <div
                              className={styles.sourcesTitle}
                              style={{ fontSize: 12, opacity: 0.75 }}
                            >
                              Цепочка закончилась. Можно выбрать другой продукт,
                              найти источники → обобщить → получить новую
                              цепочку.
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

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
