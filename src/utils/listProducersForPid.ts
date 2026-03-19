import type { TechChain } from "./chainToFlow";

export type ProducerOption = {
  trId: string; // "Преобразование7"
  title: string; // "Название технологии"
};

function pickFirstValue(obj: Record<string, string> | null | undefined) {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.values(obj);
  return typeof vals[0] === "string" ? vals[0] : null;
}

export function listProducersForPid(
  rawChain: TechChain | null | undefined,
  targetPid: string,
): ProducerOption[] {
  const items = Array.isArray(rawChain?.Цепочка) ? rawChain!.Цепочка : [];
  const out: ProducerOption[] = [];

  for (const n of items) {
    if (n?.["Тип узла"] !== "Преобразование") continue;

    const outs = Array.isArray(n?.["Выходы"]) ? n["Выходы"] : [];
    const produces = outs.some(
      (o: Record<string, string>) => pickFirstValue(o) === targetPid,
    );
    if (!produces) continue;

    out.push({
      trId: String(n["Id узла"] || "").trim(),
      title: String(n["Название технологии"] || "").trim(),
    });
  }

  // уникальность по trId
  const seen = new Set<string>();
  return out.filter((x) => x.trId && !seen.has(x.trId) && seen.add(x.trId));
}
