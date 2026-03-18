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

/* function pickPid(
  obj: Record<string, string> | undefined | null,
): string | null {
  if (!obj) return null;
  const v = Object.values(obj)[0];
  return typeof v === "string" ? v : null;
} */

function pickPid(
  obj: Record<string, string> | null | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
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

// buildLevelFromRawChain.ts (пример логики)

export function buildLevelFromRawChain(
  rawChain: TechChain,
  targetPid: string,
  trId?: string,
) {
  const items = Array.isArray(rawChain?.Цепочка) ? rawChain.Цепочка : [];

  const productsById = new Map<string, any>();
  const transforms: any[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] === "Продукт") productsById.set(n["Id узла"], n);
    if (n?.["Тип узла"] === "Преобразование") transforms.push(n);
  }

  // producer
  const t = trId
    ? transforms.find((x) => x["Id узла"] === trId)
    : transforms.find((x) =>
        (x["Выходы"] || []).map(pickPid).filter(Boolean).includes(targetPid),
      );

  if (!t) return { ok: false as const };

  const inPids = (t["Входы"] || []).map(pickPid).filter(Boolean) as string[];
  const outPids = (t["Выходы"] || []).map(pickPid).filter(Boolean) as string[];

  const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean);

  const needPids = uniq([targetPid, ...inPids, ...outPids]);

  const цепочка = [
    ...needPids.map((pid) => productsById.get(pid)).filter(Boolean),
    t,
  ];

  // можно оставить порядок “product(s) + transform”, либо привести к нужному
  return {
    ok: true as const,
    transformationId: t["Id узла"],
    inputPids: uniq(inPids),
    outputPids: uniq(outPids),
    chain: { Цепочка: цепочка },
  };
}
