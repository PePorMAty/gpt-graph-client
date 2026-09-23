// src/components/flow-panel/types.ts
import type {
  BuildDirection,
  ProductCard,
  StepChainApiStep,
  StepChainStatus,
  TechnologySource,
} from "../../store/types";
import type { TechChain } from "../../utils/chainToFlow";
import type { SourceGroup } from "../../utils/sourceRows";
import type { LinkedProduct } from "../../utils/getLinkedProducts";

type Status = "idle" | "loading" | "succeeded" | "failed";

export interface FillCardOptions {
  customSystemPrompt?: string;
  selectedFields?: string[];
  useWebSearch?: boolean;
}

/** Props for one direction tab (down or up) */
export interface DirectionTabProps {
  direction: BuildDirection;

  onFindSources?: (opts?: {
    customSystemPrompt?: string;
    maxItems?: number;
    /** Whitelist доменов для web_search (3.3); пусто/undefined = искать везде. */
    allowedDomains?: string[];
  }) => void;
  sourcesLoading?: boolean;
  sourcesError?: string | null;
  sources: TechnologySource[];

  /** selectedSources — подмножество источников, отмеченное чекбоксами (3.1);
   *  undefined = использовать все. */
  onAggregateSources?: (
    customSystemPrompt?: string,
    customUserPrompt?: string,
    selectedSources?: TechnologySource[],
  ) => void;
  aggregateLoading?: boolean;
  aggregateError?: string | null;
  hasAggregated?: boolean;
  aggregatedDescription?: string | null;
  onChangeAggregatedDescription?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Правка обобщённого описания шага (step-by-step flow). */
  onChangeStepAggregatedText?: (text: string) => void;

  /** Ручное добавление источника (3.2): пишет в пул и node.data.
   *  Возвращает текст ошибки (невалидный url / дубль) или null при успехе. */
  onAddManualSource?: (src: {
    title: string;
    url: string;
    description?: string;
  }) => string | null;

  productName?: string;

  chainLoading?: boolean;
  chainError?: string | null;
  chainReady?: boolean;
  chainUiEnabled?: boolean;
  isActiveChainRoot?: boolean;
  canInitChainHere?: boolean;
  initChainLabel?: string;
  onInitChain?: (customSystemPrompt?: string) => void;

  queueLen?: number;
  chainPid?: string | null;
  onExpandNext?: () => void;

  // --- build mode toggle (shared by full + step flows) ---
  /**
   * Окно построения, а не вкладка карточки.
   *
   * Раньше на этом месте стоял выбор режима — «вся цепочка» или «по шагам», —
   * и признаком служило само его наличие. Режим остался один, признак нужен
   * по-прежнему: тот же компонент обслуживает и карточку, где построения нет.
   */
  isBuildContext?: boolean;

  /**
   * Показать конкретный экран мастера, а не выведенный из состояния.
   *
   * Нужен для возврата назад: обобщение уже получено, но человек вернулся к
   * источникам по номеру в полосе шагов. Без этого состояние тянуло бы его
   * обратно вперёд — источники-то обобщены.
   */
  stageOverride?: 2 | 3;

  // --- step-by-step chain ---
  stepChainStatus?: StepChainStatus;
  stepChainError?: string | null;
  stepChainStepCount?: number;
  stepChainCurrentProductLabel?: string;
  stepChainCurrentProductNodeId?: string;
  stepChainInsufficientProducts?: string[];

  onAcceptStep?: (
    selectedContinueProductNodeId?: string,
    filteredStep?: StepChainApiStep,
  ) => void;
  onRejectStep?: () => void;
  onUndoStep?: () => void;

  pendingStep?: StepChainApiStep | null;

  stepChainBranchOptions?: Array<{ nodeId: string; label: string }>;
  onSelectBranch?: (nodeId: string) => void;

  // --- step v2 flow (dedicated /step/* routes) ---
  stepSources?: TechnologySource[];
  stepSourcesStatus?: Status;
  stepSourcesError?: string | null;
  /** Если источники текущего продукта унаследованы — имя продукта-источника (иначе null). */
  stepSourcesOrigin?: string | null;
  /** Источники закончились — повторный поиск не дал новых сверх уже найденных. */
  stepSourcesExhausted?: boolean;
  /** Маркер с build родителя: продукту нужен свежий поиск источников.
   *  Причины — см. InitialGraphStateI.needsFreshSources в store/types.ts. */
  stepNeedsFreshSources?: {
    fromProduct: string;
    reason?: "insufficient" | "cycle" | "alternative" | "manual";
    loopOn?: string[];
  } | null;

  stepAggregatedText?: string | null;
  stepAggregateStatus?: Status;
  stepAggregateError?: string | null;
  stepNeedsSources?: boolean;
  stepInsufficientProducts?: string[];

  stepBuildResult?: TechChain | null;
  stepBuildStatus?: Status;
  stepBuildError?: string | null;
  /** Шаг уже построен из текущего обобщения — кнопка «Построить шаг» скрыта до переобобщения. */
  stepBuiltFromAggregate?: boolean;

  onFetchStepSources?: (opts?: {
    customSystemPrompt?: string;
    maxItems?: number;
    /** Whitelist доменов для web_search (3.3); пусто/undefined = искать везде. */
    allowedDomains?: string[];
    provider?: string;
    model?: string;
  }) => void;
  /** Прерывает идущий поиск источников (он может длиться минутами). */
  onCancelStepSources?: () => void;
  /** selectedSources — подмножество источников (3.1); undefined = все. */
  onAggregateStepSources?: (
    customSystemPrompt?: string,
    customUserPrompt?: string,
    selectedSources?: TechnologySource[],
    provider?: string,
    model?: string,
  ) => void;
  onBuildStep?: (
    customText?: string,
    customSystemPrompt?: string,
    provider?: string,
    model?: string,
  ) => void;
  onClearStepState?: () => void;
  /** Открыть превью шага, построенного при insufficient («построить всё равно»). */
  onForceStepPreview?: () => void;

  // --- alternative node (step-by-step flow) ---
  isAlternativeNode?: boolean;
  altDescription?: string;
}

export interface FlowPanelProps {
  onClose: () => void;
  isOpen: boolean;
  value: string;
  /** Название правится в шапке карточки, поле там многострочное. */
  onChangeValue: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  descriptionValue: string;
  onChangeDescription: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFieldBlur?: () => void; // Сохранение при потере фокуса поля имени/описания

  /** Нода — альтернатива (chainVariant === "alt"): описание рендерим как markdown. */
  isAltNode?: boolean;
  /** Узел уже в закладках — пункт меню меняется на «убрать». */
  isBookmarked?: boolean;
  /**
   * Поставить/снять закладку. У альтернатив закладок нет — там проп не
   * передаётся, и пункт меню не показывается.
   */
  onToggleBookmark?: () => void;
  /** Удалить узел (через то же подтверждение, что и правый клик по полотну). */
  onDeleteNode?: () => void;
  /**
   * Продукт добавлен вручную в превью шага и ещё без описания — показываем
   * подсказку у поля «Описание». Пометка снимается сама, как только описание
   * заполнено (флага «заполнен» не храним).
   */
  isUnfilledUserProduct?: boolean;
  /** Направление альтернативного шага (alt-нода) — для кнопки «Построить альтернативу». */
  altDirection?: BuildDirection;
  /** Обобщённое описание преобразования (markdown) — для тумблера в карточке. */
  aggregatedDescription?: string;
  /** Коммит markdown-описания (alt): пишет строку в node.data.description. */
  onCommitDescription?: (text: string) => void;
  /** Коммит обобщённого описания преобразования → node.data.aggregatedDescription. */
  onCommitAggregatedDescription?: (text: string) => void;

  nodeId?: string | null;
  nodeType?: string;

  // sources attached to a transformation node (transformation-between endpoint)
  transformationSources?: string[];

  // fill card (Описание tab)
  onBuildProductCard?: (options?: FillCardOptions) => void;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCard?: ProductCard | null;

  // per-direction tabs
  downTab: DirectionTabProps;
  upTab: DirectionTabProps;

  /** У продукта есть прямые соседи-продукты без преобразования между ними. */
  hasProductNeighbors?: boolean;
  /** Открыть модалку «Получение преобразования между продуктами». */
  onFetchTransformations?: () => void;

  /** Продукты, связанные с выбранным (напрямую или через преобразование) —
   *  ссылки в карточке продукта. */
  linkedProducts?: LinkedProduct[];
  /** Клик по ссылке-соседу: закрыть карточку и сфокусировать полотно на ноде. */
  onFocusLinkedProduct?: (nodeId: string) => void;

  /** Группы источников по всем продуктам (реальные из пула) — для таблицы. */
  sourceGroups?: SourceGroup[];
  /** Продукт, чьи источники подсвечиваются при открытии таблицы (для не-продуктовых нод — якорь). */
  sourcesCurrentProduct?: string;

  /** Режим «только просмотр» (шар-ссылка): имя/описание read-only, без заполнения карточки. */
  readOnly?: boolean;
}
