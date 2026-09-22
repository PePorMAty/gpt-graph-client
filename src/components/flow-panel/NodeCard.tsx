import { useEffect, useMemo, useRef, useState, type FC } from "react";

import type { DirectionTabProps, FlowPanelProps } from "./types";
import { FillCardBlock } from "./FillCardBlock";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { NodeSourcesBlock } from "./NodeSourcesBlock";
import { CardTitleField } from "./CardTitleField";
import { KeyInfoBlock } from "./KeyInfoBlock";
import { NodeIdentifiers } from "./NodeIdentifiers";
import { IndustryPanel } from "../industry/IndustryPanel";
import { MarkdownEditor } from "../markdown-editor";
import { toTransformationRoutesView } from "../../utils/transformationRoutesView";
import { useDismiss } from "../../hooks/useDismiss";
import {
  BookmarkIcon,
  BranchIcon,
  ChainLengthIcon,
  ChevronRightIcon,
  CloseIcon,
  FlaskIcon,
  GearIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from "../icons";
import styles from "./NodeCard.module.css";

/** Вкладки карточки. У преобразования третья — маршруты, у продукта — ГИСП. */
type CardTab = "brief" | "tech" | "industry" | "routes";

interface NodeCardProps extends FlowPanelProps {
  /** Поток построения цепочки по одному направлению (живёт в FlowPanel). */
  DirectionContent: FC<DirectionTabProps>;
  /** Выбор направления + поток построения (живёт в FlowPanel). */
  PanelBuildView: FC<{
    productName: string;
    downTab: DirectionTabProps;
    upTab: DirectionTabProps;
    onBack?: () => void;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Идентификатор узла для шапки карточки.
 *
 * Узлы, пришедшие с сервера, несут UUID — целиком он в шапке не нужен, берём
 * префикс по типу и первые шесть знаков. Узлы пошагового построения несут
 * говорящий id (`tech_step::…`) — его показываем как есть, только укорачивая.
 * В обоих случаях это настоящий id, а не выдуманный номер.
 */
function shortNodeId(nodeId: string | null | undefined, type: string): string {
  if (!nodeId) return "—";
  if (UUID_RE.test(nodeId)) {
    const prefix = type === "transformation" ? "tech" : "prod";
    return `${prefix}_${nodeId.replace(/-/g, "").slice(0, 6)}`;
  }
  return nodeId.length > 26 ? `${nodeId.slice(0, 25)}…` : nodeId;
}

export const NodeCard: FC<NodeCardProps> = ({
  onClose,
  isOpen,
  value,
  onChangeValue,
  descriptionValue,
  onChangeDescription,
  onFieldBlur,

  nodeType,
  transformationSources,

  onBuildProductCard,
  productCardStatus,
  productCardError,
  productCard,

  downTab,
  upTab,

  hasProductNeighbors = false,
  onFetchTransformations,
  linkedProducts = [],
  onFocusLinkedProduct,
  readOnly = false,
  nodeId,
  sourceGroups = [],
  sourcesCurrentProduct = "",
  isAltNode = false,
  isBookmarked = false,
  onToggleBookmark,
  onDeleteNode,
  isUnfilledUserProduct = false,
  altDirection,
  aggregatedDescription,
  onCommitDescription,
  onCommitAggregatedDescription,

  DirectionContent,
  PanelBuildView,
}) => {
  const effectiveNodeType = nodeType || "product";
  const isProduct = effectiveNodeType === "product";
  // Альтернатива — тоже узел-преобразование, но со своей семантикой:
  // фиолетовая пробирка вместо оранжевой шестерёнки, как и на полотне.
  const kind: "product" | "transformation" | "alt" = isAltNode
    ? "alt"
    : isProduct
      ? "product"
      : "transformation";
  const KIND_LABEL = {
    product: "Продукт",
    transformation: "Технология",
    alt: "Альтернатива",
  } as const;

  const [tab, setTab] = useState<CardTab>("brief");
  const [buildOpen, setBuildOpen] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismiss(menuRef, () => setMenuOpen(false), menuOpen);

  // Сброс при смене выбранного узла.
  useEffect(() => {
    setTab("brief");
    setBuildOpen(false);
    setDescEditing(false);
    setMenuOpen(false);
  }, [nodeId]);

  // Esc закрывает окно построения.
  useEffect(() => {
    if (!buildOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuildOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [buildOpen]);

  const hasAggregatedDesc =
    typeof aggregatedDescription === "string" &&
    aggregatedDescription.trim().length > 0;

  // Обобщение шага несёт служебные разделы — в карточке они лишние.
  const aggregatedPreview = useMemo(
    () => toTransformationRoutesView(aggregatedDescription ?? ""),
    [aggregatedDescription],
  );

  const tabs = useMemo(() => {
    const list: Array<{ id: CardTab; label: string }> = [
      { id: "brief", label: "Краткое описание" },
    ];
    // У альтернативы нет ни карточки технологии, ни обобщения шага: её
    // содержимое — одно markdown-описание варианта.
    if (kind === "alt") return list;

    list.push({ id: "tech", label: "Технологическое описание" });
    if (isProduct) list.push({ id: "industry", label: "Промышленное знание" });
    else if (hasAggregatedDesc)
      list.push({ id: "routes", label: "Технологические маршруты" });
    return list;
  }, [kind, isProduct, hasAggregatedDesc]);

  // Выбранная вкладка могла исчезнуть (сменился узел, обобщение не пришло).
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "brief";

  if (!isOpen) return null;

  const canBuild = !readOnly && (isProduct || (isAltNode && !!altDirection));

  return (
    <>
      <div className={`${styles.card} ${isOpen ? styles.cardOpen : ""}`}>
        {/* ── Шапка ── */}
        <header className={styles.header}>
          <span
            className={`${styles.avatar} ${styles[`avatar_${kind}`]}`}
            aria-hidden
          >
            {kind === "transformation" ? (
              <GearIcon size={22} />
            ) : (
              <FlaskIcon size={22} />
            )}
          </span>

          <div className={styles.headerMain}>
            <div className={styles.titleRow}>
              <CardTitleField
                value={value}
                onChange={onChangeValue}
                onBlur={onFieldBlur}
                readOnly={readOnly}
              />
              <span className={`${styles.kindBadge} ${styles[`kind_${kind}`]}`}>
                {KIND_LABEL[kind]}
              </span>
            </div>
            <NodeIdentifiers
              nodeId={nodeId}
              short={shortNodeId(nodeId, effectiveNodeType)}
              productName={isProduct ? value : undefined}
            />
          </div>

          <div className={styles.headerActions}>
            <div className={styles.menuWrap} ref={menuRef}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Ещё"
                aria-expanded={menuOpen}
              >
                …
              </button>
              {menuOpen && (
                <div className={styles.menu}>
                  {canBuild && (
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => {
                        setBuildOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      <ChainLengthIcon size={16} className={styles.menuItemIcon} />
                      {isAltNode ? "Построить альтернативу" : "Построить шаг"}
                    </button>
                  )}
                  {isProduct &&
                    hasProductNeighbors &&
                    onFetchTransformations && (
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => {
                          onFetchTransformations();
                          setMenuOpen(false);
                        }}
                      >
                        <BranchIcon size={16} className={styles.menuItemIcon} />
                        Преобразование между продуктами
                      </button>
                    )}
                  {/* Закладки только у продуктов и преобразований:
                      альтернатива живёт внутри шага, отмечать её незачем. */}
                  {onToggleBookmark && !isAltNode && (
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => {
                        onToggleBookmark();
                        setMenuOpen(false);
                      }}
                    >
                      <BookmarkIcon size={16} className={styles.menuItemIcon} />
                      {isBookmarked ? "Убрать из закладок" : "Добавить в закладки"}
                    </button>
                  )}

                  {onDeleteNode && (
                    <button
                      type="button"
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      onClick={() => {
                        onDeleteNode();
                        setMenuOpen(false);
                      }}
                    >
                      <TrashIcon size={16} className={styles.menuItemIcon} />
                      Удалить
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="Закрыть карточку"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </header>

        {/* ── Вкладки ── */}
        <nav className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {/* ── Краткое описание ── */}
          {activeTab === "brief" && (
            <>
              <CollapsibleBlock
                title="Описание"
                actions={
                  !readOnly &&
                  !isAltNode && (
                    <button
                      type="button"
                      className={styles.blockAction}
                      onClick={() => setDescEditing((v) => !v)}
                    >
                      <PencilIcon size={15} />
                      {descEditing ? "Готово" : "Редактировать"}
                    </button>
                  )
                }
              >
                {isUnfilledUserProduct && (
                  <div className={styles.hintWarning}>
                    Продукт добавлен вручную — описание не заполнено. Заполните
                    его здесь, и пометка с узла снимется.
                  </div>
                )}

                {isAltNode ? (
                  /* Описание альтернативы — markdown. */
                  <MarkdownEditor
                    value={descriptionValue}
                    onChange={readOnly ? undefined : onCommitDescription}
                    placeholder="Введите описание (Markdown)"
                  />
                ) : descEditing && !readOnly ? (
                  <textarea
                    className={styles.textarea}
                    value={descriptionValue}
                    onChange={onChangeDescription}
                    onBlur={onFieldBlur}
                    placeholder="Введите описание узла"
                    rows={6}
                    autoFocus
                  />
                ) : descriptionValue.trim() ? (
                  <p className={styles.descriptionText}>{descriptionValue}</p>
                ) : (
                  <div className={styles.blockEmpty}>
                    Описание не заполнено.
                  </div>
                )}
              </CollapsibleBlock>

              {/* Ключевая информация — параметры карточки технологии.
                  У продукта их место занимают «Промышленные данные». */}
              {kind === "transformation" && (
                <KeyInfoBlock
                  card={productCard}
                  nodeId={nodeId}
                  onEdit={() => setTab("tech")}
                />
              )}

              {/* Связанные продукты — только у продукта и только если есть. */}
              {isProduct && linkedProducts.length > 0 && (
                <CollapsibleBlock
                  title="Связанные продукты"
                  count={linkedProducts.length}
                  icon={<LinkIcon size={17} />}
                >
                  <ul className={styles.linked}>
                    {linkedProducts.map((p) => (
                      <li key={`${p.role}-${p.nodeId}`}>
                        <button
                          type="button"
                          className={styles.linkedItem}
                          onClick={() => onFocusLinkedProduct?.(p.nodeId)}
                          title={
                            (p.screenDirection === "up"
                              ? "Выше по графу"
                              : "Ниже по графу") +
                            (p.viaTransformation
                              ? ` через «${p.viaTransformation}»`
                              : "")
                          }
                        >
                          <FlaskIcon size={15} className={styles.linkedIcon} />
                          <span className={styles.linkedLabel}>
                            {p.label || p.nodeId}
                          </span>
                          {p.viaTransformation && (
                            <span className={styles.linkedVia}>
                              {p.viaTransformation}
                            </span>
                          )}
                          <ChevronRightIcon
                            size={15}
                            className={styles.linkedArrow}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </CollapsibleBlock>
              )}

              {canBuild && (
                <button
                  type="button"
                  className={styles.buildButton}
                  onClick={() => setBuildOpen(true)}
                >
                  {isAltNode ? "Построить альтернативу" : "Построить шаг"}
                </button>
              )}

              {isProduct && (
                <NodeSourcesBlock
                  groups={sourceGroups}
                  product={sourcesCurrentProduct}
                />
              )}

              {/* Ссылки на источники преобразования лежат прямо на узле. */}
              {!isProduct &&
                Array.isArray(transformationSources) &&
                transformationSources.length > 0 && (
                  <CollapsibleBlock
                    title="Источники"
                    count={transformationSources.length}
                  >
                    <ol className={styles.sourceLinks}>
                      {transformationSources.map((url, i) => (
                        <li key={`${i}-${url}`}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </CollapsibleBlock>
                )}
            </>
          )}

          {/* ── Технологическое описание ── */}
          {activeTab === "tech" && (
            <FillCardBlock
              key={nodeId ?? "tech"}
              nodeType={effectiveNodeType}
              layout="tech"
              onBuildProductCard={onBuildProductCard}
              productCardStatus={productCardStatus}
              productCardError={productCardError}
              productCard={productCard}
              readOnly={readOnly}
            />
          )}

          {/* ── Промышленные данные (ГИСП) ── */}
          {activeTab === "industry" && <IndustryPanel productName={value} />}

          {/* ── Технологические маршруты (обобщение шага) ── */}
          {activeTab === "routes" && (
            <MarkdownEditor
              value={aggregatedDescription ?? ""}
              previewValue={aggregatedPreview}
              onChange={readOnly ? undefined : onCommitAggregatedDescription}
              placeholder="Обобщённое описание (Markdown)"
            />
          )}
        </div>
      </div>

      {/* ── Построение в модальном окне ── */}
      {buildOpen && !readOnly && (
        <div className={styles.modalOverlay} onClick={() => setBuildOpen(false)}>
          <div
            className={styles.modalWindow}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {isAltNode
                  ? `Построение альтернативы — «${value}»`
                  : `Построение — «${value}»`}
              </h3>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setBuildOpen(false)}
                aria-label="Закрыть"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {isAltNode && altDirection ? (
                /* У альтернативы направление фиксировано — селектор не нужен. */
                <DirectionContent
                  {...(altDirection === "down" ? downTab : upTab)}
                />
              ) : (
                <PanelBuildView
                  productName={value}
                  downTab={downTab}
                  upTab={upTab}
                  onBack={() => setBuildOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
