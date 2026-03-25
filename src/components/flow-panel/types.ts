// src/components/flow-panel/types.ts
import type {
  BuildDirection,
  ProductCard,
  TechnologySource,
} from "../../store/types";

export interface FillCardOptions {
  customSystemPrompt?: string;
  selectedFields?: string[];
  useWebSearch?: boolean;
}

export interface FlowPanelProps {
  onClose: () => void;
  isOpen: boolean;
  value: string;
  onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete?: () => void;
  descriptionValue: string;
  onChangeDescription: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;

  nodeId?: string | null;
  nodeType?: string;

  buildDirection?: BuildDirection | null;
  onSetBuildDirection?: (dir: BuildDirection) => void;

  onFindSources?: () => void;
  sourcesLoading?: boolean;
  sourcesError?: string | null;
  sources: TechnologySource[];

  onAggregateSources?: () => void;
  aggregateLoading?: boolean;
  aggregateError?: string | null;
  hasAggregated?: boolean;

  chainLoading?: boolean;
  chainError?: string | null;

  chainReady?: boolean;
  chainPid?: string | null;
  isActiveChainRoot?: boolean;
  chainUiEnabled?: boolean;

  canInitChainHere?: boolean;

  initChainLabel?: string;

  producerOptions?: Array<{ trId: string; title: string }>;
  selectedProducerId?: string;
  expandedProducerId?: string;

  builtProducerIds: string[];
  selectedAlreadyBuilt?: boolean;

  queueLen?: number;
  isChainRootUi?: boolean;

  onInitChain?: () => void;
  onSelectProducer?: (trId: string) => void;
  onExpandLevel?: () => void;
  onExpandNext?: () => void;

  onBuildProductCard?: (options?: FillCardOptions) => void;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCard?: ProductCard | null;
}