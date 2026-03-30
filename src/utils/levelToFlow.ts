// src/utils/levelToFlow.ts
import { Position, type Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type {
  ChainProductNode,
  ChainTransformNode,
  TechChain,
} from "./chainToFlow";

function pickPid(
  obj: Record<string, string> | null | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.values(obj);
  const v = vals[0];
  return typeof v === "string" ? v : null;
}

type Opts = {
  namespace: string; // можно оставить для совместимости, но мы НЕ используем для id
  rootNodeId: string;
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
  const trFlowId = `chain::${rootNodeId}::tr::${chainTrId}`;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const outPids = (t["Выходы"] || []).map(pickPid).filter(Boolean) as string[];

  const uniqueInputs = Array.from(new Set(inPids)).filter(
    (pid) => pid && pid !== targetPid,
  );

  const uniqueOutputs = Array.from(new Set(outPids)).filter(
    (pid) => pid && pid !== targetPid,
  );

  const isDown = direction === "down";

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
  edges.push({
    id: `chain::${rootNodeId}::e::${targetNodeId}::${trFlowId}`,
    source: isDown ? targetNodeId : trFlowId,
    target: isDown ? trFlowId : targetNodeId,
    sourceHandle: "bottom",
    targetHandle: "top",
    type: "straight",
  });

  // --- inputs row (центрируем относительно targetX) ---
  const nIn = uniqueInputs.length;
  const inRowWidth = nIn > 1 ? (nIn - 1) * spacingX : 0;
  const inStartX = targetX - inRowWidth / 2;

  uniqueInputs.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${rootNodeId}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);
    const x = inStartX + idx * spacingX;

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

    // edge: input -> transformation (input feeds into process)
    edges.push({
      id: `chain::${rootNodeId}::e-in::${trFlowId}::${pFlowId}`,
      source: isDown ? trFlowId : pFlowId,
      target: isDown ? pFlowId : trFlowId,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "straight",
    });
  });

  // --- side outputs (побочки) ---
  // ✅ КЛЮЧ: ставим их НА УРОВНЕ inputs-row, как на “правильном” скрине
  const outputsY = inputsY;

  // начинаем справа от всего input-ряда (чтобы не налезать)
  const outStartX = targetX + inRowWidth / 2 + spacingX;

  uniqueOutputs.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${rootNodeId}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);
    const x = outStartX + idx * spacingX;

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x, y: outputsY },
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

    // edge: transformation -> output (stable)
    edges.push({
      id: `chain::${rootNodeId}::e::${trFlowId}::${pFlowId}`,
      source: isDown ? trFlowId : pFlowId,
      target: isDown ? pFlowId : trFlowId,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "straight",
    });
  });

  return { nodes, edges, pidToNodeIdNext };
}
