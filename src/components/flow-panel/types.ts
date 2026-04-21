// src/components/flow-panel/types.ts
import type {
  BuildDirection,
  ProductCard,
  StepChainApiStep,
  StepChainStatus,
  TechnologySource,
} from "../../store/types";

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

  // --- step-by-step chain ---
  chainBuildMode?: "full" | "step";
  onChangeChainBuildMode?: (mode: "full" | "step") => void;

  stepChainStatus?: StepChainStatus;
  stepChainError?: string | null;
  stepChainStepCount?: number;
  stepChainCurrentProductLabel?: string;
  stepChainInsufficientProducts?: string[];

  onFetchNextStep?: () => void;
  onAcceptStep?: (selectedContinueProductNodeId?: string) => void;
  onRejectStep?: () => void;
  onRetryStep?: () => void;
  onUndoStep?: () => void;

  pendingStep?: StepChainApiStep | null;

  stepChainBranchOptions?: Array<{ nodeId: string; label: string }>;
  onSelectBranch?: (nodeId: string) => void;

  onFetchStepSources?: () => void;
  stepSourcesLoading?: boolean;
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
}
