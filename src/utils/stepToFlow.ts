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
  const trId = step.transformation.id || String(stepNumber);
  const trFlowId = `step::${sessionKey}::tr::${stepNumber}::${trId}`;
  const trY = anchorY + sign * stepY1;

  nodes.push({
    id: trFlowId,
    type: "transformation",
    position: { x: anchorX, y: trY },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      label: step.transformation.name,
      description: step.transformation.description || "",
      chainRootNodeId: rootNodeId,
      chainDirection: direction,
      stepChainSessionKey: sessionKey,
      stepChainStepNumber: stepNumber,
    },
  });

  // --- 5) ребро: anchor → transformation ---
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

  // --- 6) узлы-продукты ---
  const productCount = renderProducts.length;
  const productsY = trY + sign * stepY2;
  const rowWidth = productCount > 1 ? (productCount - 1) * spacingX : 0;
  const startX = anchorX - rowWidth / 2;

  renderProducts.forEach(({ product, existingNodeId }, idx) => {
    const x = startX + idx * spacingX;

    if (existingNodeId) {
      // Существующий продукт (законное схождение) — только ребро, без узла
      mergedProductNodeIds.push(existingNodeId);

      const edgeId = `step::${sessionKey}::e::${trFlowId}::${existingNodeId}`;
      edges.push({
        id: edgeId,
        source: trFlowId,
        target: existingNodeId,
        sourceHandle: isDown ? "bottom" : "top-source",
        targetHandle: isDown ? "top" : "bottom-target",
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
  };

  return { nodes, edges, stepRecord };
}
