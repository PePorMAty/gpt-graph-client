import type { BuildDirection, TechnologySource } from "../../store/types";

export interface FlowPanelProps {
  onClose: () => void;
  isOpen: boolean;
  value: string;
  onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete?: () => void;
  descriptionValue: string; // Добавляем значение описания
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
}
