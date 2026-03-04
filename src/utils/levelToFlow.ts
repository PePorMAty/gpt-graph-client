// src/utils/levelToFlow.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { TechChain } from "./chainToFlow";

function pickPid(
  obj: Record<string, string> | null | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.values(obj);
  const v = vals[0];
  return typeof v === "string" ? v : null;
}

type Opts = {
  namespace: string; // chain::root::lvl::pid::trId
  rootNodeId: string;
  targetNodeId: string; // XYFlow id продукта, который раскрываем
  targetPid: string; // "Продукт1", "Продукт6", ...
  targetX: number; // X продукта
  targetY: number; // Y продукта
  direction: "up" | "down";
  pidToNodeId: Record<string, string>;

  spacingX?: number; // шаг по X между входными продуктами
  stepY1?: number; // шаг target -> transformation
  stepY2?: number; // шаг transformation -> inputs row
};

export function levelToFlow(levelChain: TechChain, opts: Opts) {
  const {
    namespace,
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

  const products = new Map<string, any>();
  const transforms: any[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] === "Продукт") products.set(n["Id узла"], n);
    if (n?.["Тип узла"] === "Преобразование") transforms.push(n);
  }

  const t = transforms[0];
  if (!t) return { nodes: [], edges: [], pidToNodeIdNext: pidToNodeId };

  const pidToNodeIdNext = { ...pidToNodeId };
  pidToNodeIdNext[targetPid] = targetNodeId;

  const sign = direction === "down" ? 1 : -1;

  // ✅ ВЕРТИКАЛЬНАЯ СТРУКТУРА:
  // product (targetY)
  //   -> transformation (targetY + sign*stepY1)
  //        -> inputs row (trY + sign*stepY2)
  const trY = targetY + sign * stepY1;
  const inputsY = trY + sign * stepY2;

  const trFlowId = `${namespace}::tr::${t["Id узла"]}`;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const uniqueInputs = Array.from(new Set(inPids)).filter(
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
      label: t["Название технологии"] || t["Id узла"],
      description: "",
      chainTrId: t["Id узла"],
      chainLevelOfPid: targetPid,
    } as any,
  });

  // edge: target product -> transformation (направление “раскрытия”)
  edges.push({
    id: `${namespace}::e_from_target::${targetNodeId}::${trFlowId}`,
    source: targetNodeId,
    target: trFlowId,
    type: "straight",
  });

  // inputs row (одна линия), растягиваем по X и центрируем относительно targetX
  const n = uniqueInputs.length;
  const rowWidth = n > 1 ? (n - 1) * spacingX : 0;
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
        description: "",
        chainPid: pid,
      } as any,
    });

    // edge: transformation -> input
    edges.push({
      id: `${namespace}::e_to_input_${idx}::${trFlowId}::${pFlowId}`,
      source: trFlowId,
      target: pFlowId,
      type: "straight",
    });
  });

  return { nodes, edges, pidToNodeIdNext };
}
