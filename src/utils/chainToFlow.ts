// src/utils/chainToFlow.ts
import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

type ChainProductNode = {
  "Id узла": string;
  "Тип узла": "Продукт";
  Продукты: string[];
  "Название узла": string;
  "Описание продукта"?: string; // ✅ NEW
};

type ChainTransformNode = {
  "Id узла": string;
  "Тип узла": "Преобразование";
  "Название технологии": string;
  "Описание технологии"?: string; // ✅ NEW
  Входы: Array<Record<string, string>>;
  Выходы: Array<Record<string, string>>;
};

export type TechChain = {
  Цепочка: Array<ChainProductNode | ChainTransformNode>;
};

type ChainToFlowOpts = {
  namespace: string; // например `${nodeId}::chain`
  targetNodeId: string; // существующая XYFlow нода продукта (по которой кликнули)
  targetPid?: string; // default "Продукт1"
  baseX?: number; // где рисовать новые ноды
  baseY?: number;
  spacingX?: number;
  spacingY?: number;
};

function pickPid(
  obj: Record<string, string> | null | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.values(obj);
  if (!vals.length) return null;
  const v = vals[0];
  return typeof v === "string" ? v : null;
}

export function chainToFlow(
  chain: TechChain,
  opts: ChainToFlowOpts,
): { nodes: CustomNode[]; edges: Edge[] } {
  const {
    namespace,
    targetNodeId,
    targetPid = "Продукт1",
    baseX = 0,
    baseY = 0,
    spacingX = 260,
    spacingY = 140,
  } = opts;

  const items = Array.isArray(chain?.["Цепочка"]) ? chain["Цепочка"] : [];

  const products = new Map<string, ChainProductNode>();
  const transforms: ChainTransformNode[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] === "Продукт") {
      products.set((n as ChainProductNode)["Id узла"], n as ChainProductNode);
    }
    if (n?.["Тип узла"] === "Преобразование") {
      transforms.push(n as ChainTransformNode);
    }
  }

  // обычно в level1.chain ровно одно преобразование, но на всякий случай возьмем первое
  const t = transforms[0];
  if (!t) return { nodes: [], edges: [] };

  const tFlowId = `${namespace}::${t["Id узла"]}`;

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const outPids = (t["Выходы"] || []).map(pickPid).filter(Boolean) as string[];

  // --- Nodes ---
  const nodes: CustomNode[] = [];

  // transformation node
  nodes.push({
    id: tFlowId,
    type: "transformation",
    position: { x: baseX - spacingX, y: baseY },
    data: {
      label: t["Название технологии"] || "Преобразование",
      description: t["Описание технологии"] || "", // ✅ NEW
      chainTrId: t["Id узла"], // ✅ useful
      chainLevelOfPid: targetPid, // ✅ useful
      chainRootNodeId: targetNodeId, // ✅ root = nodeId that started chain
    } as any,
  });

  // input products nodes (не target)
  const uniqueInputs = Array.from(new Set(inPids)).filter(
    (pid) => pid !== targetPid,
  );
  const startY = baseY - ((uniqueInputs.length - 1) * spacingY) / 2;

  uniqueInputs.forEach((pid, idx) => {
    const p = products.get(pid);
    const pFlowId = `${namespace}::${pid}`;

    nodes.push({
      id: pFlowId,
      type: "product",
      position: { x: baseX - spacingX * 2, y: startY + idx * spacingY },
      data: {
        label: p?.["Название узла"] || p?.["Продукты"]?.[0] || pid,
        description: p?.["Описание продукта"] || "", // ✅ NEW
        chainPid: pid, // ✅ useful
        chainRootNodeId: targetNodeId, // ✅ belongs to this chain root
      } as any,
    });
  });

  // --- Edges ---
  const edges: Edge[] = [];

  // inputs -> transformation
  uniqueInputs.forEach((pid, idx) => {
    const pFlowId = `${namespace}::${pid}`;
    edges.push({
      id: `${namespace}::e_in_${idx}_${pFlowId}_${tFlowId}`,
      source: pFlowId,
      target: tFlowId,
      type: "straight",
    });
  });

  // transformation -> target node (существующая нода)
  if (outPids.includes(targetPid)) {
    edges.push({
      id: `${namespace}::e_out_target_${tFlowId}_${targetNodeId}`,
      source: tFlowId,
      target: targetNodeId,
      type: "straight",
    });
  }

  return { nodes, edges };
}
