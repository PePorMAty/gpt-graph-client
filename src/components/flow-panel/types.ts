// src/components/flow-panel/types.ts
import type {
  BuildDirection,
  DesignVariant,
  ProductCard,
  StepChainApiStep,
  StepChainStatus,
  TechnologySource,
} from "../../store/types";
import type { BuildMode } from "../../store/slices/sourcesSlice";
import type { TechChain } from "../../utils/chainToFlow";
import type { SourceRow } from "../../utils/mockSources";

type Status = "idle" | "loading" | "succeeded" | "failed";

export interface FillCardOptions {
  customSystemPrompt?: string;
  selectedFields?: string[];
  useWebSearch?: boolean;
}

/** Props for one direction tab (down or up) */
export interface DirectionTabProps {
  direction: BuildDirection;

  onFindSources?: (opts?: { customSystemPrompt?: string; maxItems?: number }) => void;
  sourcesLoading?: boolean;
  sourcesError?: string | null;
  sources: TechnologySource[];

  onAggregateSources?: (customSystemPrompt?: string, customUserPrompt?: string) => void;
  aggregateLoading?: boolean;
  aggregateError?: string | null;
  hasAggregated?: boolean;
  aggregatedDescription?: string | null;
  onChangeAggregatedDescription?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Правка обобщённого описания шага (step-by-step flow). */
  onChangeStepAggregatedText?: (text: string) => void;

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
  buildMode?: BuildMode;
  onChangeBuildMode?: (mode: BuildMode) => void;

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
  onRetryStep?: () => void;
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
  /** Маркер с build родителя: источников для этого продукта не хватает — нужен свежий поиск. */
  stepNeedsFreshSources?: {
    fromProduct: string;
    reason?: "insufficient" | "cycle" | "alternative";
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

  onFetchStepSources?: (opts?: { customSystemPrompt?: string; maxItems?: number }) => void;
  onAggregateStepSources?: (customSystemPrompt?: string, customUserPrompt?: string) => void;
  onBuildStep?: (customText?: string, customSystemPrompt?: string) => void;
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
  onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => void;
  descriptionValue: string;
  onChangeDescription: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFieldBlur?: () => void; // Сохранение при потере фокуса поля имени/описания

  /** Нода — альтернатива (chainVariant === "alt"): описание рендерим как markdown. */
  isAltNode?: boolean;
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

  // panel mode
  mode: "card" | "build";
  buildDirection?: BuildDirection;

  /**
   * Вариант дизайна точки входа build (временный переключатель сравнения):
   * "A" — build открывается кнопками на ноде (панель работает как раньше по `mode`);
   * "B" — в панели вкладки «Карточка»/«Построение»;
   * "C" — в карточке кнопка «Построение», переключающая панель во внутренний build-view;
   * "D" — как C, но построение открывается в модальном окне + кнопка «Источники» (таблица).
   */
  variant?: DesignVariant;

  /** Все источники по всем продуктам (реальные из пула или мок) — для таблицы (вариант D). */
  sourceRows?: SourceRow[];

  /** Режим «только просмотр» (шар-ссылка): имя/описание read-only, без заполнения карточки. */
  readOnly?: boolean;
}
