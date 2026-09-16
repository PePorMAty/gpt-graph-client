import { type Node, type Edge, type NodeProps } from "@xyflow/react";
import type {
  BuildDirection,
  ProductCard,
  TechnologySource,
} from "./store/types";

/* ====== DATA STRUCTURE FROM SERVER ====== */

// Структура node.data
export interface CustomNodeData {
  label: string;
  description?: string;
  /**
   * Собственный идентификатор продукта.
   *
   * Название для сравнения продуктов не годится: у вещества их несколько, и
   * «ИПБ», «Изопропилбензол» и «Кумол» оставались тремя узлами при объединении
   * графов. Одинаковый идентификатор — один продукт, как бы он ни был подписан.
   *
   * Чем именно является значение — код ТН ВЭД, номер CAS или пометка человека —
   * говорит productIdSource. Для сравнения это неважно.
   */
  productId?: string;
  productIdSource?: "manual" | "tnved" | "cas" | "dictionary";
  /**
   * Обобщённое описание шага (markdown), прокинутое на transformation-ноду от
   * продукта-якоря, от которого строился шаг (step-by-step). Показывается в
   * карточке преобразования через переключатель «Описание ↔ Обобщённое».
   */
  aggregatedDescription?: string;
  /**
   * Технологическое описание продуктового шага (обычный текст, 2–4
   * предложения) — вкладка «Технологическое описание» в карточке
   * преобразования. Запрашивается на /gpt/tech-description и правится вручную.
   */
  /** Техописание, сохранённое до разделения по направлениям. Читается как
   *  запасной вариант для направления, в котором строилось преобразование. */
  techDescription?: string;
  techDescriptionStatus?: "idle" | "loading" | "succeeded" | "failed";
  techDescriptionError?: string | null;

  // --- техописание по направлениям: у вкладок «вверх» и «вниз» разные
  //     продукты, поэтому и описание у каждой своё ---
  techDescriptionUp?: string;
  techDescriptionDown?: string;
  techDescriptionStatusUp?: "idle" | "loading" | "succeeded" | "failed";
  techDescriptionStatusDown?: "idle" | "loading" | "succeeded" | "failed";
  techDescriptionErrorUp?: string | null;
  techDescriptionErrorDown?: string | null;

  // --- product card ---
  productCard?: ProductCard;
  productCardStatus?: "idle" | "loading" | "succeeded" | "failed";
  productCardError?: string | null;
  productCardKind?: string;

  // --- chain ---
  chainPid?: string;
  chainRootNodeId?: string;
  chainBuiltRoot?: boolean;
  chainVariant?: "main" | "alt";
  chainTrId?: string;
  chainLevelOfPid?: string;

  // --- sources (legacy single-direction, kept for migration) ---
  sources?: TechnologySource[];
  sourcesAggregated?: boolean;
  sources_meta?: { product: string; maxItems: number; fetchedAt: string };

  // --- per-direction sources ---
  sourcesDown?: TechnologySource[];
  sourcesUp?: TechnologySource[];
  sourcesAggregatedDown?: boolean;
  sourcesAggregatedUp?: boolean;
  downDescription?: string;
  upDescription?: string;

  // --- direction (legacy, kept for migration) ---
  buildDirection?: BuildDirection;

  // --- chain direction (which direction this node's chain uses) ---
  chainDirection?: BuildDirection;
  // Направление альтернативного шага (alt-нода). chainDirection у alt-нод не
  // ставится, поэтому ориентация рёбер в merge берёт направление и отсюда.
  stepAltDirection?: BuildDirection;

  // --- step-by-step chain ---
  stepChainSessionKey?: string;
  stepChainStepNumber?: number;
  /**
   * Продукт добавлен пользователем вручную в превью шага. Пока описание
   * пустое, узел показывается как «не заполнен» (пунктирная рамка + значок);
   * заполнение описания снимает пометку само, отдельного флага не нужно.
   */
  isUserAdded?: boolean;

  // --- multi-source upload (presentation tracking) ---
  presentations?: string[];
  presentationColor?: string;
  /** Оригинальные написания продукта в каждой презентации (например,
   * один узел может объединить «Ацетон» из одного графа и «Ацетоны»
   * из другого — оба значения здесь сохраняются по имени презентации). */
  labelsByPresentation?: Record<string, string>;

  // --- transformation node (transformation-between endpoint) ---
  transformationSources?: string[];

  // --- слой промышленных данных (ГИСП) ---
  /**
   * Число производителей продукта, найденных в реестре ГИСП. Производное поле:
   * проставляется в Flow.tsx в копии данных для рендера по ответу сервера и в
   * сохранённый граф НЕ попадает — иначе файл носил бы в себе устаревший срез
   * реестра. Отсутствие поля означает «не проверялся», 0 — «проверен, не найден».
   */
  gispProducers?: number;
  /** Продукт найден в реестре. Производное, см. gispProducers. */
  gispConfirmed?: boolean;
  /** Слой ГИСП включён тумблером «Промышленные данные» (производное,
   *  НЕ персистится; проставляется в Flow.tsx в копии данных для рендера). */
  showIndustryData?: boolean;

  // --- sources badge (производное, НЕ персистится) ---
  /** Числа продуктов-источников для бейджей «📖 N» на узле по направлениям
   *  (↑ вверх / ↓ вниз). Вычисляется в Flow.tsx (flowNodes) из sourcesPool +
   *  node.data и кладётся только в копию данных для рендера, в стор/файл графа
   *  не попадает. */
  sourcesBadge?: { up: number; down: number };

  // --- плотный вид узла (производное, НЕ персистится) ---
  /** Узел рисуется в фокус-режиме с охватом больше одного шага: подпись
   *  крупнее, блок шире и с меньшими полями (см. nodeBox.ts). Ставится в
   *  Flow.tsx только в копии данных для рендера. */
  focusCompact?: boolean;

  // required by @xyflow/react Node<T extends Record<string, unknown>>
  [key: string]: unknown;
}

// Основной тип узла react-flow
// type определяется как (product | transformation)
export type CustomNode = Node<CustomNodeData>;

// Edge от сервера
export interface CustomEdge extends Edge {
  type?: string;
}

/* ====== NODE PROPS FOR CUSTOM COMPONENTS ====== */
export type ProductNodeProps = NodeProps<CustomNode>;
export type TransformationNodeProps = NodeProps<CustomNode>;

/* ====== SERVER API TYPES ====== */

export interface GPTNode {
  id: string;
  type?: string;
  data: {
    label: string;
    name?: string;
  };
  position?: { x: number; y: number };
}

export interface GPTEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface GPTGraphResponse {
  success: boolean;
  nodes: GPTNode[];
  edges: GPTEdge[];
  leaf_nodes: string[];
  has_more: boolean;
}
