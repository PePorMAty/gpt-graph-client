// src/utils/levelToFlow.ts
import type { Edge } from "@xyflow/react";
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
  namespace: string; // оставляем, но больше НЕ используем для id
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

  const trY = targetY + sign * stepY1;
  const inputsY = trY + sign * stepY2;

  // ✅ СТАБИЛЬНЫЙ id ДЛЯ ПРЕОБРАЗОВАНИЯ (не зависит от targetPid)
  const chainTrId = String(t["Id узла"] || "").trim();
  const trFlowId = `chain::${rootNodeId}::tr::${chainTrId}`;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const uniqueInputs = Array.from(new Set(inPids)).filter(
    (pid) => pid !== targetPid,
  );

  const outPids = (t["Выходы"] || []).map(pickPid).filter(Boolean) as string[];
  const uniqueOutputs = Array.from(new Set(outPids)).filter(
    (pid) => pid !== targetPid,
  );

  const nodes: CustomNode[] = [];
  const edges: Edge[] = [];

  // transformation node
  nodes.push({
    id: trFlowId,
    type: "transformation",
    position: { x: targetX, y: trY },
    data: {
      label: t["Название технологии"] || chainTrId,
      description: t["Описание технологии"] || "", // ✅ вернули описания
      chainTrId,
      chainRootNodeId: rootNodeId,
    },
  });

  // edge: target product -> transformation (стабильный id)
  edges.push({
    id: `chain::${rootNodeId}::e::prod_to_tr::${targetNodeId}::${trFlowId}`,
    source: targetNodeId,
    target: trFlowId,
    type: "straight",
  });

  // -------- INPUTS row (одной строкой) --------
  const nIn = uniqueInputs.length;
  const rowWidth = nIn > 1 ? (nIn - 1) * spacingX : 0;
  const startX = targetX - rowWidth / 2;

  uniqueInputs.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${rootNodeId}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);
    const x = startX + idx * spacingX;

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x, y: inputsY },
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: p?.["Описание продукта"] || "", // ✅ вернули описания
        chainPid: pid,
        chainRootNodeId: rootNodeId,
      },
    });

    edges.push({
      id: `chain::${rootNodeId}::e::in::${trFlowId}::${pFlowId}`,
      source: trFlowId,
      target: pFlowId,
      type: "straight",
    });
  });

  // -------- OUTPUTS (побочки) на линии target --------
  const outputsY = targetY;
  const outStartX = targetX + spacingX;

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
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: p?.["Описание продукта"] || "",
        chainPid: pid,
        chainRootNodeId: rootNodeId,
      },
    });

    edges.push({
      id: `chain::${rootNodeId}::e::out::${trFlowId}::${pFlowId}`,
      source: trFlowId,
      target: pFlowId,
      type: "straight",
    });
  });

  return { nodes, edges, pidToNodeIdNext };
}
