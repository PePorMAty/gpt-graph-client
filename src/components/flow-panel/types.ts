// src/components/flow-panel/types.ts
import type {
  BuildDirection,
  ProductCard,
  StepChainApiStep,
  StepChainStatus,
  TechnologySource,
} from "../../store/types";
import type { BuildMode } from "../../store/slices/sourcesSlice";
import type { TechChain } from "../../utils/chainToFlow";

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
    reason?: "insufficient" | "cycle";
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

  /** Режим «только просмотр» (шар-ссылка): имя/описание read-only, без заполнения карточки. */
  readOnly?: boolean;
}
