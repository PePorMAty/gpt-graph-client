import { useEffect, useRef, useState, type FC } from "react";

import type { FlowPanelProps } from "./types";
import styles from "./FlowPanel.module.css";
import { LinkifiedText } from "../linkified-text";

export const FlowPanel: FC<FlowPanelProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  onDelete,
  descriptionValue,
  onChangeDescription,
  onFindSources,
  nodeType,
  tech,
  onSelectTechPath,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);

  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Закрытие при клике вне панели
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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // если панель закрыли — выходим из режима редактирования описания
  useEffect(() => {
    if (!isOpen) setIsEditingDescription(false);
  }, [isOpen]);

  // автофокус в textarea при входе в режим редактирования
  useEffect(() => {
    if (isEditingDescription) {
      // next tick, чтобы DOM точно был
      setTimeout(() => {
        descRef.current?.focus();
        // курсор в конец
        const len = descRef.current?.value?.length ?? 0;
        descRef.current?.setSelectionRange(len, len);
      }, 0);
    }
  }, [isEditingDescription]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  const handleSelectTechPath = (
    e: React.MouseEvent<HTMLElement>,
    alt: any,
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!onSelectTechPath) return;

    onSelectTechPath({
      kind: "alternative",
      index,
      name: alt.Название,
    });
    onClose();
  };

  const openDescEditor = () => setIsEditingDescription(true);
  const closeDescEditor = () => setIsEditingDescription(false);

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <div
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
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
          {/* ✅ ОДНО поле описания: либо превью, либо textarea */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Описание:</label>

            {!isEditingDescription ? (
              <div
                className={styles.previewBox}
                onDoubleClick={openDescEditor}
                title="Двойной клик — редактировать"
              >
                {descriptionValue?.trim() ? (
                  // кликабельные ссылки прямо внутри текста
                  <LinkifiedText text={descriptionValue} />
                ) : (
                  <span className={styles.previewPlaceholder}>
                    (двойной клик, чтобы добавить описание)
                  </span>
                )}
              </div>
            ) : (
              <textarea
                ref={descRef}
                value={descriptionValue}
                onChange={onChangeDescription}
                onBlur={closeDescEditor}
                className={styles.formTextarea}
                placeholder="Введите описание узла"
                rows={6}
              />
            )}
          </div>

          {nodeType === "product" && tech?.aggregated && (
            <div className={styles.techBox}>
              <div className={styles.techHeaderRow}>
                <div className={styles.techTitle}>Пути построения</div>

                {/* текущий выбор */}
                <div className={styles.techSelected}>
                  Выбрано:{" "}
                  {tech.selectedPath?.kind === "alternative"
                    ? (tech.aggregated.Альтернативы?.[tech.selectedPath.index]
                        ?.Название ?? tech.selectedPath.name)
                    : "Основной путь"}
                </div>
              </div>

              {/* Основной путь */}
              {Array.isArray(tech.aggregated.Сводная_технология?.Шаги) &&
                tech.aggregated.Сводная_технология.Шаги.length > 0 && (
                  <div className={styles.pathBlock}>
                    <div className={styles.pathRow}>
                      <div className={styles.pathName}>Основной путь</div>
                      {onSelectTechPath && (
                        <button
                          type="button"
                          className={styles.selectPathBtn}
                          disabled={tech.selectedPath?.kind === "summary"}
                          onClick={() => onSelectTechPath({ kind: "summary" })}
                        >
                          {tech.selectedPath?.kind === "summary"
                            ? "Выбран"
                            : "Выбрать"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Альтернативы */}
              {Array.isArray(tech.aggregated.Альтернативы) &&
                tech.aggregated.Альтернативы.length > 0 && (
                  <div className={styles.altList}>
                    <div className={styles.altTitle}>Альтернативные пути</div>

                    {tech.aggregated.Альтернативы.map(
                      (alt: any, index: number) => {
                        const isSelected =
                          tech.selectedPath?.kind === "alternative" &&
                          tech.selectedPath.index === index;

                        return (
                          <details
                            key={alt.Название}
                            className={styles.altItem}
                          >
                            <summary className={styles.altSummary}>
                              <span>{alt.Название}</span>

                              {onSelectTechPath && (
                                <button
                                  type="button"
                                  className={styles.selectPathBtn}
                                  disabled={isSelected}
                                  onClick={(e) =>
                                    handleSelectTechPath(e, alt, index)
                                  }
                                >
                                  {isSelected ? "Выбран" : "Выбрать"}
                                </button>
                              )}
                            </summary>

                            {Array.isArray(alt.Шаги) && alt.Шаги.length > 0 && (
                              <ol className={styles.techList}>
                                {alt.Шаги.map((s: string, i: number) => (
                                  <li key={`${alt.Название}-${i}`}>{s}</li>
                                ))}
                              </ol>
                            )}

                            {Array.isArray(alt.Варианты) &&
                              alt.Варианты.length > 0 && (
                                <div className={styles.variantsBox}>
                                  {alt.Варианты.map((v: any, i: number) => (
                                    <div
                                      key={`${alt.Название}-v-${i}`}
                                      className={styles.variantItem}
                                    >
                                      <div className={styles.variantTitle}>
                                        {v.Отличие}
                                      </div>
                                      <ul className={styles.variantList}>
                                        {v.Детали.map(
                                          (d: string, j: number) => (
                                            <li
                                              key={`${alt.Название}-v-${i}-${j}`}
                                            >
                                              {d}
                                            </li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </details>
                        );
                      },
                    )}
                  </div>
                )}
            </div>
          )}
          {/* ✅ Кнопка только для product */}
          {onFindSources && nodeType === "product" && (
            <div className={styles.formGroup}>
              <button
                type="button"
                onClick={() => {
                  onFindSources();
                  onClose();
                }}
                className={styles.findSourcesButton}
              >
                🔎 Найти источники / построить
              </button>
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

/* {
  nodeType === "product" && tech?.aggregated && (
    <div className={styles.techBox}>

      {Array.isArray(tech.aggregated.Сводная_технология?.Шаги) &&
        tech.aggregated.Сводная_технология.Шаги.length > 0 && (
          <>
            <div className={styles.techTitle}>Основной путь</div>
            <ol className={styles.techList}>
              {tech.aggregated.Сводная_технология.Шаги.map((s, idx) => (
                <li key={`${idx}-${s}`}>{s}</li>
              ))}
            </ol>
          </>
        )}


      {Array.isArray(tech.aggregated.Альтернативы) &&
        tech.aggregated.Альтернативы.length > 0 && (
          <>
            <div className={styles.techTitle}>Альтернативные пути</div>

            <div className={styles.altList}>
              {tech.aggregated.Альтернативы.map((alt) => (
                <details key={alt.Название} className={styles.altItem}>
                  <summary className={styles.altSummary}>
                    {alt.Название}
                  </summary>

                  {Array.isArray(alt.Шаги) && alt.Шаги.length > 0 && (
                    <ol className={styles.techList}>
                      {alt.Шаги.map((s, idx) => (
                        <li key={`${alt.Название}-${idx}`}>{s}</li>
                      ))}
                    </ol>
                  )}

                  {Array.isArray(alt.Варианты) && alt.Варианты.length > 0 && (
                    <div className={styles.variantsBox}>
                      {alt.Варианты.map((v, i) => (
                        <div
                          key={`${alt.Название}-v-${i}`}
                          className={styles.variantItem}
                        >
                          <div className={styles.variantTitle}>{v.Отличие}</div>
                          <ul className={styles.variantList}>
                            {v.Детали.map((d, j) => (
                              <li key={`${alt.Название}-v-${i}-${j}`}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

               
                  <button
                    type="button"
                    className={styles.altFutureBtn}
                    disabled
                    title="Эндпоинт для запроса по альтернативе появится позже"
                  >
                    Запросить по этому варианту (скоро)
                  </button>
                </details>
              ))}
            </div>
          </>
        )}
    </div>
  );
} */
