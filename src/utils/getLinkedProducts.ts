import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export type LinkedProduct = {
  nodeId: string;
  label: string;
  /** Направление связи относительно текущего продукта (по рёбрам графа). */
  role: "incoming" | "outgoing";
  /** Имя преобразования-посредника, если связь идёт через него (не напрямую). */
  viaTransformation?: string;
};

// Продукты, связанные с данным: напрямую ребром продукт→продукт или через одно
// преобразование (продукт → преобразование → продукт). Для карточки продукта —
// список ссылок-соседей, по клику на которые полотно фокусируется на ноде.
// В отличие от getDirectProductNeighbors (только прямые рёбра, для вставки
// преобразований) здесь основной случай — связь через преобразование.
export function getLinkedProducts(
  nodeId: string,
  nodes: CustomNode[],
  edges: Edge[],
): LinkedProduct[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const me = byId.get(nodeId);
  if (!me || me.type !== "product") return [];

  const outBySource = new Map<string, Edge[]>();
  const inByTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    (
      outBySource.get(e.source) ?? outBySource.set(e.source, []).get(e.source)!
    ).push(e);
    (inByTarget.get(e.target) ?? inByTarget.set(e.target, []).get(e.target)!).push(
      e,
    );
  }

  const result: LinkedProduct[] = [];
  const seen = new Set<string>(); // `${role}::${nodeId}` — дедуп в пределах роли

  const push = (
    node: CustomNode | undefined,
    role: "incoming" | "outgoing",
    via?: string,
  ) => {
    if (!node || node.type !== "product" || node.id === nodeId) return;
    const key = `${role}::${node.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      nodeId: node.id,
      label: String(node.data?.label ?? ""),
      role,
      ...(via ? { viaTransformation: via } : {}),
    });
  };

  // Исходящие: сосед напрямую или через преобразование-посредник.
  for (const e of outBySource.get(nodeId) ?? []) {
    const next = byId.get(e.target);
    if (!next) continue;
    if (next.type === "product") {
      push(next, "outgoing");
      continue;
    }
    if (next.type === "transformation") {
      const via = String(next.data?.label ?? "");
      for (const e2 of outBySource.get(next.id) ?? []) {
        push(byId.get(e2.target), "outgoing", via);
      }
    }
  }

  // Входящие: зеркально.
  for (const e of inByTarget.get(nodeId) ?? []) {
    const prev = byId.get(e.source);
    if (!prev) continue;
    if (prev.type === "product") {
      push(prev, "incoming");
      continue;
    }
    if (prev.type === "transformation") {
      const via = String(prev.data?.label ?? "");
      for (const e2 of inByTarget.get(prev.id) ?? []) {
        push(byId.get(e2.source), "incoming", via);
      }
    }
  }

  return result;
}
