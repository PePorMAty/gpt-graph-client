// src/utils/levelToFlow.ts
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type {
  ChainProductNode,
  ChainTransformNode,
  TechChain,
} from "./chainToFlow";
import { pickPid } from "./pickPid";

type Opts = {
  namespace: string; // можно оставить для совместимости, но мы НЕ используем для id
  rootNodeId: string;
  chainSessionKey?: string; // для генерации ID нод/рёбер (включает направление)
  targetNodeId: string;
  targetPid: string;
  targetX: number;
  targetY: number;
  direction: "up" | "down";
  pidToNodeId: Record<string, string>;

  spacingX?: number;
  stepY1?: number;
  stepY2?: number;
};

export function levelToFlow(levelChain: TechChain, opts: Opts) {
  const {
    rootNodeId,
    chainSessionKey,
    targetNodeId,
    targetPid,
    targetX,
    targetY,
    direction,
    pidToNodeId,
    spacingX = 260,
    stepY1 = 180,
    stepY2 = 220,
  } = opts;

  // idRoot includes direction to avoid collisions between up/down chains
  const idRoot = chainSessionKey ?? rootNodeId;

  const items = Array.isArray(levelChain?.Цепочка) ? levelChain.Цепочка : [];

  const products = new Map<string, ChainProductNode>();
  const transforms: ChainTransformNode[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] === "Продукт") products.set(n["Id узла"], n);
    if (n?.["Тип узла"] === "Преобразование") transforms.push(n);
  }

  const t = transforms[0];
  if (!t) return { nodes: [], edges: [], pidToNodeIdNext: pidToNodeId };

  const pidToNodeIdNext = { ...pidToNodeId };
  pidToNodeIdNext[targetPid] = targetNodeId;

  const sign = direction === "down" ? 1 : -1;

  // target (на якоре) -> transformation -> inputs-row
  const trY = targetY + sign * stepY1;
  const inputsY = trY + sign * stepY2;

  // stable ids
  const chainTrId = String(t["Id узла"] || "").trim();
  const trFlowId = `chain::${idRoot}::tr::${chainTrId}`;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const outPids = (t["Выходы"] || []).map(pickPid).filter(Boolean) as string[];

  const uniqueInputs = Array.from(new Set(inPids)).filter(
    (pid) => pid && pid !== targetPid,
  );

  const uniqueOutputs = Array.from(new Set(outPids)).filter(
    (pid) => pid && pid !== targetPid,
  );

  const isDown = direction === "down";

  // down: main row (centered) = uniqueInputs; side = uniqueOutputs
  // up:   main row (centered) = uniqueOutputs; side = uniqueInputs
  const mainPids = direction === "up" ? uniqueOutputs : uniqueInputs;
  const sidePids = direction === "up" ? uniqueInputs : uniqueOutputs;

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];

  // --- transformation ---
  nodes.push({
    id: trFlowId,
    type: "transformation",
    position: { x: targetX, y: trY },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      label: (t["Название технологии"] || chainTrId).replace(/^Шаг\s+\d+\.\s*/, ""),
      description: t["Описание технологии"] || "",
      chainTrId,
      chainRootNodeId: rootNodeId,
      chainDirection: direction,
    },
  });

  // edge: target -> transformation (stable)
  // "down": anchor (upper) → transformation (lower) — exit from anchor's bottom, enter tr's top
  // "up":   anchor (lower) → transformation (upper) — exit from anchor's top, enter tr's bottom
  edges.push({
    id: `chain::${idRoot}::e::${targetNodeId}::${trFlowId}`,
    source: targetNodeId,
    target: trFlowId,
    sourceHandle: isDown ? "bottom" : "top-source",
    targetHandle: isDown ? "top" : "bottom-target",
    type: "straight",
  });

  // --- main row (центрируем относительно targetX) ---
  const nMain = mainPids.length;
  const mainRowWidth = nMain > 1 ? (nMain - 1) * spacingX : 0;
  const mainStartX = targetX - mainRowWidth / 2;

  mainPids.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${idRoot}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);
    const x = mainStartX + idx * spacingX;

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x, y: inputsY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: p?.["Описание продукта"] || "",
        chainPid: pid,
        chainRootNodeId: rootNodeId,
        chainDirection: direction,
      },
    });

    edges.push({
      id: `chain::${idRoot}::e-in::${trFlowId}::${pFlowId}`,
      source: trFlowId,
      target: pFlowId,
      sourceHandle: isDown ? "bottom" : "top-source",
      targetHandle: isDown ? "top" : "bottom-target",
      type: "straight",
    });
  });

  // --- side row (побочные ноды — справа от main row) ---
  const sideStartX = targetX + mainRowWidth / 2 + spacingX;

  sidePids.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${idRoot}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);
    const x = sideStartX + idx * spacingX;

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x, y: inputsY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: p?.["Описание продукта"] || "",
        chainPid: pid,
        chainRootNodeId: rootNodeId,
        chainDirection: direction,
      },
    });

    edges.push({
      id: `chain::${idRoot}::e::${trFlowId}::${pFlowId}`,
      source: trFlowId,
      target: pFlowId,
      sourceHandle: isDown ? "bottom" : "top-source",
      targetHandle: isDown ? "top" : "bottom-target",
      type: "straight",
    });
  });

  return { nodes, edges, pidToNodeIdNext };
}
