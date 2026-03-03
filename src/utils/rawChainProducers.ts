// utils/rawChainProducers.ts
import type { TechChain } from "./chainToFlow";

export function listProducersForPid(
  raw: TechChain,
  targetPid: string,
): string[] {
  const items = Array.isArray(raw?.Цепочка) ? raw.Цепочка : [];
  const out: string[] = [];

  for (const n of items as any[]) {
    if (n?.["Тип узла"] !== "Преобразование") continue;
    const outs = Array.isArray(n?.["Выходы"]) ? n["Выходы"] : [];
    const produces = outs.some(
      (o: any) => Object.values(o || {})[0] === targetPid,
    );
    if (produces) out.push(n["Id узла"]);
  }
  return out;
}
