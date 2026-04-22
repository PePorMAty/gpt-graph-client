// src/utils/stepToFlow.ts
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { StepChainApiStep, StepRecord } from "../store/types";
import {
  findExistingProductNode,
  normalizeProductName,
} from "./normalizeProductName";
import { computeShiftX } from "./resolveChainOverlap";

export interface StepToFlowOpts {
  sessionKey: string;
  rootNodeId: string;
  direction: "up" | "down";
  anchorNodeId: string;
  anchorX: number;
  anchorY: number;
  stepNumber: number;
  existingNodes: CustomNode[];
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
    spacingX = 260,
    stepY1 = 180,
    stepY2 = 220,
  } = opts;

  const isDown = direction === "down";
  const sign = direction === "down" ? 1 : -1;

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];

  const newProductNodeIds: string[] = [];
  const mergedProductNodeIds: string[] = [];
  const addedEdgeIds: string[] = [];

  // --- 1) transformation node ---
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

  // --- 2) edge: anchor → transformation ---
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

  // --- 3) product nodes (inputs + outputs, excluding anchor product) ---
  const anchorNode = existingNodes.find((n) => n.id === anchorNodeId);
  const anchorLabel = anchorNode?.data?.label || "";
  const anchorNorm = normalizeProductName(anchorLabel);

  // Collect all products, tag with their role
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

  // Skip the anchor product (the one we're building from)
  const productsToProcess = allProducts.filter(
    ({ product }) => normalizeProductName(product.name) !== anchorNorm,
  );

  // Deduplicate by normalized name within step
  const seenNorm = new Set<string>();
  const uniqueProducts = productsToProcess.filter(({ product }) => {
    const norm = normalizeProductName(product.name);
    if (seenNorm.has(norm)) return false;
    seenNorm.add(norm);
    return true;
  });

  const productCount = uniqueProducts.length;
  const productsY = trY + sign * stepY2;
  const rowWidth = productCount > 1 ? (productCount - 1) * spacingX : 0;
  const startX = anchorX - rowWidth / 2;

  uniqueProducts.forEach(({ product }, idx) => {
    // Check if existing product matches
    const existingNodeId = product.isExisting
      ? findExistingProductNode(product.name, existingNodes)
      : null;

    const x = startX + idx * spacingX;

    if (existingNodeId) {
      // Existing product — edge only, no new node
      mergedProductNodeIds.push(existingNodeId);

      const edgeId = `step::${sessionKey}::e::${trFlowId}::${existingNodeId}`;
      edges.push({
        id: edgeId,
        source: trFlowId,
        target: existingNodeId,
        sourceHandle: !isDown ? "bottom" : "top-source",
        targetHandle: !isDown ? "top" : "bottom-target",
        type: "straight",
      });
      addedEdgeIds.push(edgeId);
    } else {
      // New product — create node + edge
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
        sourceHandle: !isDown ? "bottom" : "top-source",
        targetHandle: !isDown ? "top" : "bottom-target",
        type: "straight",
      });
      addedEdgeIds.push(edgeId);
    }
  });

  // --- 4) collision avoidance ---
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
  };

  return { nodes, edges, stepRecord };
}
