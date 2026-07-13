import type { Edge } from "@xyflow/react";
import type { CustomEdge, CustomNode } from "../types";
import type {
  ChainProductNode,
  ChainTransformNode,
  TechChain,
} from "../utils/chainToFlow";

export interface DataI {
  nodes: CustomNode[];
  edges: CustomEdge[];
}

export interface InitialGraphStateI {
  data: DataI;
  rootId: string | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasMore: boolean;
  leafNodes: string[];
  originalPrompt: string | null;
  source: "new" | "loaded" | "continued" | null;
  chainBuild: {
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
    nodeId: string | null;
    direction: import("../types").BuildDirection | null;
  };
  chainSessions: Record<string, ChainSessionData>;
  stepChainSessions: Record<string, StepChainSession>;
  sourcesPool: Record<string, SourcesPoolEntry>;
  /**
   * Продукты, которым по оценке на build РОДИТЕЛЯ не хватило источников для
   * следующего шага. Ключ — sourcesPoolKey(label, direction); fromProduct —
   * родитель, при построении от которого продукт был помечен. Маркер
   * снимается свежим поиском источников для этого продукта.
   */
  needsFreshSources: Record<
    string,
    {
      fromProduct: string;
      // 'insufficient' — сервер на build родителя счёл источники недостаточными;
      // 'cycle' — следующий шаг по текущим источникам только замыкает петлю;
      // 'alternative' — первый шаг альтернативы: источники основного пути
      //   намеренно не унаследованы, нужен свежий поиск, чтобы альтернатива
      //   не свелась к основному маршруту.
      reason?: "insufficient" | "cycle" | "alternative";
      // Продукты-предки, на которые замкнулась бы петля (для текста плашки).
      loopOn?: string[];
    }
  >;
  /** Глобальные сквозные счётчики порядкового номера поиска источников,
   *  раздельные для построения вверх/вниз. Инкрементируются при КАЖДОМ новом
   *  поиске для продукта, у которого ещё нет своего номера в этом направлении. */
  sourcesSeqCounter: { up: number; down: number };
  acceptedStepAlternatives: Record<string, number[]>;
  /** Реестр презентация → hex-цвет. Заполняется при загрузке/добавлении пользовательских JSON-графов. */
  presentationColors: Record<string, string>;
}

export interface SourcesPoolEntry {
  sources: TechnologySource[];
  product: string;
  /**
   * Продукт, для которого источники были РЕАЛЬНО найдены (происхождение).
   * Для свежего поиска совпадает с `product`. При наследовании пула потомку
   * сохраняет исходный продукт-источник — чтобы видеть, что источники взяты
   * «взаймы» у предка, и при необходимости делать добор именно для потомка.
   */
  originProduct?: string;
  /**
   * Глобальный сквозной порядковый номер поиска (per-direction) для бейджа
   * «📖 N». Присваивается при первом собственном поиске продукта; при
   * наследовании пула копируется от предка (без инкремента счётчика).
   */
  seq?: number;
  lastFetchedAt: string;
}

/**
 * Блок источников, сохраняемый в файл графа и переносимый при объединении:
 * пул источников (ключ — sourcesPoolKey(label, direction)) + сквозные счётчики
 * номеров бейджа по направлениям. Понодовые источники (data.sourcesUp/Down) и так
 * лежат в узлах; этот блок хранит ИМЕННО нумерацию бейджа «📖 N».
 */
export interface SavedSourcesBlock {
  pool: Record<string, SourcesPoolEntry>;
  seqCounter: { up: number; down: number };
}

export interface ChainSessionData {
  rawChain: TechChain | null;
  mainTrIds: string[];
  direction?: "up" | "down";
  totalSteps: number;
  rootX: number;
  chainStatus: "idle" | "loading" | "succeeded" | "failed";
  chainError: string | null;
  pidToNodeId: Record<string, string>;
  expandedPids: string[];
  producerByPid: Record<string, string>;
  expandedProducerByPid: Record<string, string[]>;
  queue: Array<{ pid: string }>;
}

export interface GraphApiResponse {
  success: boolean;
  nodes: CustomNode[];
  edges: CustomEdge[];
  has_more?: boolean;
  leaf_nodes?: string[];
  message?: string;
}

export interface CreateGraphResult {
  data: GraphApiResponse;
  message: string;
}
export interface CreateGraphArgs {
  promptValue: string;
  promptLayout: string;
}

export interface SavedGraphMeta {
  id: string;
  name: string;
  createdAt: string;
  /** Время последнего обновления/переименования (ISO). Может отсутствовать у старых сейвов. */
  updatedAt?: string | null;
  leafCount: number;
}

export interface SaveGraphPayload {
  name?: string;
  prompt: string;
  nodes: CustomNode[];
  edges: Edge[];
  leaf_nodes: string[];
  has_more: boolean;
  /** Пул источников + сквозные счётчики номеров бейджа (если в графе есть источники). */
  sources?: SavedSourcesBlock;
}

export interface SavedGraphFile {
  meta: {
    name: string;
    prompt: string;
    createdAt: string;
  };
  graph: {
    nodes: CustomNode[];
    edges: Edge[];
  };
  state: {
    leaf_nodes: string[];
    has_more: boolean;
    /** Пул источников + счётчики номеров бейджа. Может отсутствовать у старых сейвов. */
    sources?: SavedSourcesBlock;
  };
}

// ===== SOURCES (GPT /gpt/sources) =====

export type BuildDirection = "up" | "down";

/**
 * Вариант дизайна точки входа в «построение» (временный переключатель для
 * сравнения на полотне): A — кнопки на ноде, B — вкладки в панели,
 * C — кнопка «Построение» в карточке (build-view внутри панели),
 * D — как C, но построение в модальном окне + таблица источников.
 */
export type DesignVariant = "A" | "B" | "C" | "D";

export type TechnologySource = {
  title: string;
  url: string;
  access_hint: string;
  technology_description: string;
  inputs_outputs_hint: string[];
  evidence_snippets: string[];
};

export type SourcesSearchResponse = {
  success: boolean;
  product: string;
  maxItems: number;
  blocks_preview: string[];
  sources: TechnologySource[];
  /** true — поиск не дал источников сверх уже известных (источники закончились). */
  exhausted?: boolean;
};
/* 
export type ProductCard = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

export type ProductCardResponse = {
  success: boolean;
  product: string;
  productCard: ProductCard;
  took_ms?: number;
};
 */
// store/types.ts (или где у тебя ProductCardResponse)

export type FillCardKind = "product" | "transformation";

// transformation card (как у тебя раньше)
export type TransformationCard = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

// product card (пример — подстрой под свою схему на сервере)
/* export type ProductCard = {
  product_name: string;
  product_type: string;
  purity: string;
  main_impurities: string;
  allowed_impurities: string;
  conversion_yield: string;
  typical_scale: string;
  storage: string;
  carbon_footprint: string;
  producers: string;
  applications: string;
  price: string;
};

export type ProductCardResponse = {
  success: boolean;
  product?: string | null;
  card_kind: FillCardKind;
  productCard: TransformationCard | ProductCard;
  took_ms?: number;
}; */
// store/types.ts

export type ProductCardProduct = {
  product_name: string;
  product_type: string;
  purity: string;
  main_impurities: string;
  allowed_impurities: string;
  conversion_yield: string;
  typical_scale: string;
  storage: string;
  carbon_footprint: string;
  producers: string;
  applications: string;
  price: string;
};

export type ProductCardTechnology = {
  technology_name: string;
  technology_short_description: string;
  equipment: string;
  conditions: string;
  constraints_or_key_property: string;
  additional_materials_or_catalysts: string;
  energy: string;
  enterprise_and_plant: string;
};

export type ProductCard = ProductCardProduct | ProductCardTechnology;

export type ProductCardResponse = {
  success: boolean;
  product: string | null;
  productCard: ProductCard;
  card_kind?: string;
  took_ms?: number;
};

// ===== STEP-BY-STEP CHAIN =====

export type StepProduct = {
  name: string;
  description?: string;
  isExisting: boolean;
  existingNodeLabel?: string;
};

export type StepChainApiStep = {
  transformation: { id: string; name: string; description?: string };
  inputProducts: StepProduct[];
  outputProducts: StepProduct[];
};

export type StepChainApiResponse = {
  success: boolean;
  step: StepChainApiStep;
  sourcesStatus: "sufficient" | "insufficient";
  insufficientProducts?: string[];
  error?: string;
};

export interface StepRecord {
  stepNumber: number;
  fromProductNodeId: string;
  transformationNodeId: string;
  newProductNodeIds: string[];
  mergedProductNodeIds: string[];
  addedEdgeIds: string[];
  // Выходы, которые замкнули бы петлю на предка — НЕ нарисованы (см. stepToFlow).
  cycleProductNames?: string[];
  // Тупик: после исключения петель соединять нечего, граф не менялся.
  isDeadEnd?: boolean;
}

export type StepChainStatus =
  | "idle"
  | "loading"
  | "succeeded"
  | "failed"
  | "needs-sources"
  | "fetching-sources"
  | "preview";

export interface StepChainSession {
  direction: "up" | "down";
  rootNodeId: string;
  currentProductNodeId: string;
  steps: StepRecord[];
  status: StepChainStatus;
  pendingStep: StepChainApiStep | null;
  error: string | null;
  insufficientProducts: string[];
  accumulatedSources: TechnologySource[];
}

// ===== TRANSFORMATION BETWEEN TWO PRODUCTS =====

export type TransformationBetweenPayload = {
  name: string;
  description?: string;
};

export type TransformationBetweenResponse = {
  success: boolean;
  transformation: TransformationBetweenPayload;
  error?: string;
};

// ===== TRANSFORMATIONS FOR NEIGHBORS (bulk, subgraph protocol) =====

export type ChainLink = {
  "Откуда": string;
  "Куда": string;
  "Источник": string;
  "Приемник": string;
  "Тип связи": string;
};

export type TransformationsForNeighborsRequest = {
  "Цепочка": ChainProductNode[];
  "Связи": ChainLink[];
  customSystemPrompt?: string;
};

export type ChainTransformNodeWithSources = ChainTransformNode & {
  "Источники"?: string[];
};

export type TransformationsForNeighborsResponse = {
  success?: boolean;
  "Цепочка"?: Array<ChainProductNode | ChainTransformNodeWithSources>;
  error?: string;
};

export type TransformationGroup = {
  name: string;
  description?: string;
  sources: string[];
  inputNodeIds: string[];
  outputNodeIds: string[];
};
