// src/utils/rawChainLevel.ts
import type { TechChain } from "./chainToFlow";

type ChainProductNode = {
  "Id узла": string;
  "Тип узла": "Продукт";
  Продукты: string[];
  "Название узла": string;
};

type ChainTransformNode = {
  "Id узла": string;
  "Тип узла": "Преобразование";
  "Название технологии": string;
  Входы: Array<Record<string, string>>;
  Выходы: Array<Record<string, string>>;
};

function pickPid(
  obj: Record<string, string> | undefined | null,
): string | null {
  if (!obj) return null;
  const v = Object.values(obj)[0];
  return typeof v === "string" ? v : null;
}

function trNum(id: string): number {
  const m = String(id).match(/\d+/);
  return m ? Number(m[0]) : 999999;
}

export function getProducersForPid(raw: TechChain, targetPid: string) {
  const items = Array.isArray(raw?.Цепочка) ? raw.Цепочка : [];
  const producers: ChainTransformNode[] = [];

  for (const n of items) {
    if (n && (n as any)["Тип узла"] === "Преобразование") {
      const t = n as ChainTransformNode;
      const outs = (t.Выходы || []).map(pickPid).filter(Boolean) as string[];
      if (outs.includes(targetPid)) producers.push(t);
    }
  }

  // стабильный порядок
  producers.sort((a, b) => trNum(a["Id узла"]) - trNum(b["Id узла"]));
  return producers;
}

export function buildLevelFromRawChain(
  raw: TechChain,
  targetPid: string,
  chosenTransformationId?: string,
) {
  const items = Array.isArray(raw?.Цепочка) ? raw.Цепочка : [];

  const products = new Map<string, ChainProductNode>();
  const transforms: ChainTransformNode[] = [];

  for (const n of items) {
    if (!n) continue;
    if ((n as any)["Тип узла"] === "Продукт") {
      const p = n as ChainProductNode;
      products.set(p["Id узла"], p);
    } else if ((n as any)["Тип узла"] === "Преобразование") {
      transforms.push(n as ChainTransformNode);
    }
  }

  const producers = getProducersForPid(raw, targetPid);
  if (!producers.length) {
    return {
      ok: false as const,
      reason: "no_producer",
      producers: [],
    };
  }

  const t =
    (chosenTransformationId
      ? producers.find((x) => x["Id узла"] === chosenTransformationId)
      : null) || producers[0];

  const inPids = (t.Входы || []).map(pickPid).filter(Boolean) as string[];

  const sub: Array<ChainProductNode | ChainTransformNode> = [];
  const targetP = products.get(targetPid);
  if (targetP) sub.push(targetP);
  sub.push(t);
  for (const pid of inPids) {
    const p = products.get(pid);
    if (p) sub.push(p);
  }

  return {
    ok: true as const,
    targetPid,
    transformationId: t["Id узла"],
    inputPids: inPids,
    producers, // для UI “альтернатив”
    chain: { Цепочка: sub } as TechChain,
  };
}
