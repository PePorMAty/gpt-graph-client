// src/utils/stepToFlow.ts
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { StepChainApiStep, StepRecord } from "../store/types";
import {
  findExistingProductNode,
  normalizeProductName,
} from "./normalizeProductName";
import { computeShiftX } from "./resolveChainOverlap";
import { wouldCreateCycle } from "./graphReachability";

export interface StepToFlowOpts {
  sessionKey: string;
  rootNodeId: string;
  direction: "up" | "down";
  anchorNodeId: string;
  anchorX: number;
  anchorY: number;
  stepNumber: number;
  existingNodes: CustomNode[];
  // Рёбра текущего графа — нужны для детекта петель (предок ли existing-выход).
  existingEdges?: Edge[];
  spacingX?: number;
  stepY1?: number;
  stepY2?: number;
  /** Обобщённое описание шага (markdown) от продукта-якоря — кладём на
   *  transformation-ноду для показа в карточке (переключатель «Обобщённое»). */
  anchorAggregatedText?: string | null;
}

export function stepToFlow(
  step: StepChainApiStep,
  opts: StepToFlowOpts,
): { nodes: CustomNode[]; edges: Edge[]; stepRecord: StepRecord } {
  const {
    sessionKey,
    rootNodeId,
    direction,
    anchorNodeId,
    anchorX,
    anchorY,
    stepNumber,
    existingNodes,
    existingEdges = [],
    spacingX = 260,
    stepY1 = 180,
    stepY2 = 220,
    anchorAggregatedText = null,
  } = opts;

  const isDown = direction === "down";
  const sign = direction === "down" ? 1 : -1;

  // --- 1) собрать продукты (исключая якорь) ---
  const anchorNode = existingNodes.find((n) => n.id === anchorNodeId);
  const anchorLabel = anchorNode?.data?.label || "";
  const anchorNorm = normalizeProductName(anchorLabel);

  const allProducts: Array<{
    product: (typeof step.inputProducts)[0];
    role: "input" | "output";
  }> = [
    ...step.inputProducts.map((p) => ({ product: p, role: "input" as const })),
    ...step.outputProducts.map((p) => ({
      product: p,
      role: "output" as const,
    })),
  ];

  // Убрать сам якорь (продукт, от которого строим)
  const productsToProcess = allProducts.filter(
    ({ product }) => normalizeProductName(product.name) !== anchorNorm,
  );

  // Дедуп по нормализованному имени внутри шага
  const seenNorm = new Set<string>();
  const uniqueProducts = productsToProcess.filter(({ product }) => {
    const norm = normalizeProductName(product.name);
    if (seenNorm.has(norm)) return false;
    seenNorm.add(norm);
    return true;
  });

  // --- 2) классификация: новый / существующий (схождение) / петля ---
  // Сверяем КАЖДЫЙ продукт с уже существующими узлами собственным надёжным
  // normalizeProductName — НЕ полагаясь на серверный флаг isExisting (он считает
  // слабее и при расхождении дефис/апостроф/регистр прислал бы isExisting:false,
  // из-за чего мы создали бы дубликат или замкнули цикл).
  //
  // Петля ≠ «узел уже есть». При построении вниз сырьё законно питает несколько
  // потомков (схождение DAG). Настоящая петля — только если существующий узел
  // уже ДОСТИЖИМ до якоря (его предок): тогда ребро anchor → tr → O замкнёт
  // направленный контур. Такие выходы НЕ рисуем и копим в cycleProductNames.
  const cycleProductNames: string[] = [];
  const renderProducts: Array<{
    product: (typeof step.inputProducts)[0];
    existingNodeId: string | null;
  }> = [];

  for (const { product } of uniqueProducts) {
    const existingNodeId =
      findExistingProductNode(product.name, existingNodes) ??
      (product.existingNodeLabel
        ? findExistingProductNode(product.existingNodeLabel, existingNodes)
        : null);

    if (
      existingNodeId &&
      wouldCreateCycle(existingNodeId, anchorNodeId, existingEdges)
    ) {
      cycleProductNames.push(product.name);
      continue;
    }
    renderProducts.push({ product, existingNodeId });
  }

  // --- 3) тупик: соединять нечего, ИЛИ вырожденный «дрейф к предку» ---
  // Не создаём висящий узел-трансформацию. Вызывающая сторона по isDeadEnd
  // пометит продукт «нужны свежие источники» и не будет мутировать граф.
  //
  // Вырожденный дрейф: ни одного ГЕНУИННО НОВОГО продукта, но в шаг втянут
  // предок (cycleProductNames) — модель раскрыла предка/синоним вместо якоря и
  // лишь пере-derive'ит существующее (напр. «Топливо» → существующий «Синтез-газ»
  // через вход-предок «Чар»). Рисовать ребро к соседу не нужно — это возврат к
  // предку, а не схождение. (Законное схождение: newCount===0, НО предков нет —
  // cycleProductNames пуст — тогда ребро рисуем.)
  const newCount = renderProducts.filter((r) => !r.existingNodeId).length;
  const degenerateAncestorLoop = newCount === 0 && cycleProductNames.length > 0;
  if (renderProducts.length === 0 || degenerateAncestorLoop) {
    return {
      nodes: [],
      edges: [],
      stepRecord: {
        stepNumber,
        fromProductNodeId: anchorNodeId,
        transformationNodeId: "",
        newProductNodeIds: [],
        mergedProductNodeIds: [],
        addedEdgeIds: [],
        cycleProductNames,
        isDeadEnd: true,
      },
    };
  }

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];
  const newProductNodeIds: string[] = [];
  const mergedProductNodeIds: string[] = [];
  const addedEdgeIds: string[] = [];

  // --- 4) узел-трансформация ---
  // Преобразование с тем же именем, уже построенное от этого же якоря (и
  // только от него), переиспользуем вместо создания дубля: «Нефть → Пиролиз →
  // Этилен» и следующий шаг «Пиролиз → Пропилен» дают ОДИН узел «Пиролиз» с
  // двумя выходами (правило «имя + входные продукты»).
  const trNorm = normalizeProductName(step.transformation.name);
  let reusedTrNode: CustomNode | null = null;
  if (trNorm) {
    for (const n of existingNodes) {
      if (n.type !== "transformation") continue;
      if (n.data?.chainVariant === "alt") continue;
      const label = typeof n.data?.label === "string" ? n.data.label : "";
      if (normalizeProductName(label) !== trNorm) continue;
      // Направление должно совпадать: одноимённые up/down-процессы от одного
      // якоря — разные шаги (вверх — к прекурсорам, вниз — к продуктам).
      const dir = n.data?.chainDirection;
      if (dir && dir !== direction) continue;
      // Единственный «вход» существующего преобразования — тот же якорь.
      const inputs = new Set(
        existingEdges.filter((e) => e.target === n.id).map((e) => e.source),
      );
      if (inputs.size === 1 && inputs.has(anchorNodeId)) {
        reusedTrNode = n;
        break;
      }
    }
  }

  const trId = step.transformation.id || String(stepNumber);
  const trFlowId = reusedTrNode
    ? reusedTrNode.id
    : `step::${sessionKey}::tr::${stepNumber}::${trId}`;
  const trX = reusedTrNode ? reusedTrNode.position.x : anchorX;
  const trY = reusedTrNode ? reusedTrNode.position.y : anchorY + sign * stepY1;

  if (!reusedTrNode) {
    nodes.push({
      id: trFlowId,
      type: "transformation",
      position: { x: trX, y: trY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: step.transformation.name,
        description: step.transformation.description || "",
        ...(anchorAggregatedText
          ? { aggregatedDescription: anchorAggregatedText }
          : {}),
        chainRootNodeId: rootNodeId,
        chainDirection: direction,
        stepChainSessionKey: sessionKey,
        stepChainStepNumber: stepNumber,
      },
    });

    // --- 5) ребро: anchor → transformation (у реюза оно уже есть) ---
    const anchorToTrEdgeId = `step::${sessionKey}::e::${anchorNodeId}::${trFlowId}`;
    edges.push({
      id: anchorToTrEdgeId,
      source: anchorNodeId,
      target: trFlowId,
      sourceHandle: isDown ? "bottom" : "top-source",
      targetHandle: isDown ? "top" : "bottom-target",
      type: "straight",
    });
    addedEdgeIds.push(anchorToTrEdgeId);
  }

  // --- 6) узлы-продукты ---
  const productCount = renderProducts.length;
  const productsY = trY + sign * stepY2;
  const rowWidth = productCount > 1 ? (productCount - 1) * spacingX : 0;
  const startX = trX - rowWidth / 2;

  renderProducts.forEach(({ product, existingNodeId }, idx) => {
    const x = startX + idx * spacingX;

    if (existingNodeId) {
      // Существующий продукт (законное схождение) — только ребро, без узла
      mergedProductNodeIds.push(existingNodeId);

      // Handle'ы по РЕАЛЬНОЙ геометрии, а не по направлению построения:
      // существующий узел может стоять где угодно. Напр. при схождении ВВЕРХ
      // сосед-якоря (Этилен) стоит НИЖЕ трансформации, а не над ней — и UP-handle'ы
      // («top-source»→«bottom-target») увели бы ребро «низ узла → верх
      // трансформации» с заворотом. Берём ту же логику, что applyHandlesByGeometry:
      // трансформация выше/на уровне узла → поток вниз (bottom→top), иначе вверх.
      const existingNode = existingNodes.find((n) => n.id === existingNodeId);
      const existingY = existingNode?.position?.y ?? productsY;
      const flowDown = existingY >= trY;

      const edgeId = `step::${sessionKey}::e::${trFlowId}::${existingNodeId}`;
      edges.push({
        id: edgeId,
        source: trFlowId,
        target: existingNodeId,
        sourceHandle: flowDown ? "bottom" : "top-source",
        targetHandle: flowDown ? "top" : "bottom-target",
        type: "straight",
      });
      addedEdgeIds.push(edgeId);
    } else {
      // Новый продукт — узел + ребро
      const sanitizedName = normalizeProductName(product.name).replace(
        /\s+/g,
        "_",
      );
      const pFlowId = `step::${sessionKey}::pid::${stepNumber}::${sanitizedName}`;

      nodes.push({
        id: pFlowId,
        type: "product",
        position: { x, y: productsY },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          label: product.name,
          description: product.description || "",
          chainRootNodeId: rootNodeId,
          chainDirection: direction,
          stepChainSessionKey: sessionKey,
          stepChainStepNumber: stepNumber,
          // Ручной продукт из превью шага: пока описание пустое, узел
          // помечается «не заполнен» (см. ProductNode).
          ...(product.isUserAdded ? { isUserAdded: true } : {}),
        },
      });
      newProductNodeIds.push(pFlowId);

      const edgeId = `step::${sessionKey}::e::${trFlowId}::${pFlowId}`;
      edges.push({
        id: edgeId,
        source: trFlowId,
        target: pFlowId,
        sourceHandle: isDown ? "bottom" : "top-source",
        targetHandle: isDown ? "top" : "bottom-target",
        type: "straight",
      });
      addedEdgeIds.push(edgeId);
    }
  });

  // --- 7) развод коллизий ---
  const existingForCollision = existingNodes.filter(
    (n) => !nodes.some((newN) => newN.id === n.id),
  );
  const dx = computeShiftX(nodes, existingForCollision);
  if (dx !== 0) {
    for (const n of nodes) {
      n.position = { x: n.position.x + dx, y: n.position.y };
    }
  }

  const stepRecord: StepRecord = {
    stepNumber,
    fromProductNodeId: anchorNodeId,
    transformationNodeId: trFlowId,
    newProductNodeIds,
    mergedProductNodeIds,
    addedEdgeIds,
    cycleProductNames,
    isDeadEnd: false,
    ...(reusedTrNode ? { transformationReused: true } : {}),
  };

  return { nodes, edges, stepRecord };
}
