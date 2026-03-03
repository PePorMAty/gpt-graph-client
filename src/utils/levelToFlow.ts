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
  namespace: string; // 👈 lvlPrefix приходит снаружи
  rootNodeId: string;
  targetNodeId: string;
  targetPid: string;
  baseX: number;
  baseY: number;
  pidToNodeId: Record<string, string>;
};

export function levelToFlow(levelChain: TechChain, opts: Opts) {
  const { namespace, rootNodeId, targetNodeId, targetPid, baseX, baseY } = opts;

  const items = Array.isArray(levelChain?.Цепочка) ? levelChain.Цепочка : [];

  const products = new Map<string, any>();
  const transforms: any[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] === "Продукт") products.set(n["Id узла"], n);
    if (n?.["Тип узла"] === "Преобразование") transforms.push(n);
  }

  const t = transforms[0];
  if (!t) return { nodes: [], edges: [], pidToNodeIdNext: opts.pidToNodeId };

  const spacingX = 260;
  const spacingY = 140;

  const lvlPrefix = namespace; // 👈 просто используем namespace
  const trFlowId = `${lvlPrefix}::tr::${t["Id узла"]}`;

  const pidToNodeIdNext = { ...opts.pidToNodeId };
  pidToNodeIdNext[targetPid] = targetNodeId;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];

  const nodes: CustomNode[] = [];

  nodes.push({
    id: trFlowId,
    type: "transformation",
    position: { x: baseX - spacingX, y: baseY },
    data: {
      label: t["Название технологии"] || t["Id узла"],
      description: "",
      chainPid: null,
      chainTrId: t["Id узла"],
      chainLevelOfPid: targetPid,
    } as any,
  });

  const uniqueInputs = Array.from(new Set(inPids)).filter(
    (pid) => pid !== targetPid,
  );
  const startY = baseY - ((uniqueInputs.length - 1) * spacingY) / 2;

  uniqueInputs.forEach((pid, idx) => {
    const existingId = pidToNodeIdNext[pid];
    const pFlowId = existingId || `chain::${rootNodeId}::pid::${pid}`;
    pidToNodeIdNext[pid] = pFlowId;

    const p = products.get(pid);

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x: baseX - spacingX * 2, y: startY + idx * spacingY },
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: "",
        chainPid: pid,
      } as any,
    });
  });

  const edges: Edge[] = [];

  uniqueInputs.forEach((pid, idx) => {
    const pFlowId = pidToNodeIdNext[pid];
    edges.push({
      id: `${lvlPrefix}::e_in_${idx}::${pFlowId}::${trFlowId}`,
      source: pFlowId,
      target: trFlowId,
      type: "straight",
    });
  });

  edges.push({
    id: `${lvlPrefix}::e_out::${trFlowId}::${targetNodeId}`,
    source: trFlowId,
    target: targetNodeId,
    type: "straight",
  });

  return { nodes, edges, pidToNodeIdNext };
}
