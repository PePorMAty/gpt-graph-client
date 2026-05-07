import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";

export type LoadGraphPayload = {
  nodes: CustomNode[];
  edges: Edge[];
  leafNodes: string[];
  hasMore: boolean;
  originalPrompt: string | null;
};

export type ParseResult = {
  payload: LoadGraphPayload;
  warnings: string[];
  needsLayout: boolean;
};

type RawObject = Record<string, unknown>;

function isObject(v: unknown): v is RawObject {
  return v !== null && typeof v === "object";
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asPosition(v: unknown): { x: number; y: number } | null {
  if (!isObject(v)) return null;
  const x = asNumber(v.x);
  const y = asNumber(v.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function detectFormat(parsed: RawObject): "A" | "B" | "C" {
  const graph = parsed.graph;
  if (isObject(graph) && Array.isArray(graph.nodes)) return "A";

  if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
    const hasInternalKeys =
      typeof parsed.prompt === "string" ||
      Array.isArray(parsed.leaf_nodes) ||
      typeof parsed.has_more === "boolean";

    const sample = (parsed.nodes as unknown[])[0];
    const sampleLooksInternal =
      isObject(sample) &&
      (isObject(sample.data) ||
        isObject(sample.position) ||
        typeof sample.sourcePosition === "string");

    return hasInternalKeys || sampleLooksInternal ? "B" : "C";
  }

  return "C";
}

export function parseGraphJson(raw: string | unknown): ParseResult {
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        "Невалидный JSON: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  } else {
    parsed = raw;
  }

  if (!isObject(parsed)) {
    throw new Error("JSON должен быть объектом с полями nodes и edges");
  }

  const format = detectFormat(parsed);
  const warnings: string[] = [];

  let rawNodes: unknown[] = [];
  let rawEdges: unknown[] = [];
  let originalPrompt: string | null = null;
  let leafNodes: string[] = [];
  let hasMore = false;

  if (format === "A") {
    const graph = parsed.graph as RawObject;
    rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

    const meta = isObject(parsed.meta) ? parsed.meta : null;
    originalPrompt = meta ? asString(meta.prompt) : null;

    const state = isObject(parsed.state) ? parsed.state : null;
    if (state && Array.isArray(state.leaf_nodes)) {
      leafNodes = state.leaf_nodes.filter(
        (s): s is string => typeof s === "string",
      );
    }
    hasMore = !!state?.has_more;
  } else if (format === "B") {
    rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
    originalPrompt = asString(parsed.prompt);
    if (Array.isArray(parsed.leaf_nodes)) {
      leafNodes = parsed.leaf_nodes.filter(
        (s): s is string => typeof s === "string",
      );
    }
    hasMore = parsed.has_more === true;
  } else {
    rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
  }

  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    throw new Error("JSON должен содержать массивы nodes и edges");
  }

  const usedIds = new Set<string>();
  const nodes: CustomNode[] = [];

  for (let i = 0; i < rawNodes.length; i++) {
    const rn = rawNodes[i];
    if (!isObject(rn)) {
      warnings.push(`Узел #${i}: не объект — пропущен`);
      continue;
    }

    const id = asString(rn.id);
    if (!id) {
      warnings.push(`Узел #${i}: нет id — пропущен`);
      continue;
    }
    if (usedIds.has(id)) {
      warnings.push(`Узел id="${id}": дубликат — пропущен`);
      continue;
    }

    const data = isObject(rn.data) ? rn.data : null;
    const label = asString(data?.label) ?? asString(rn.label);
    if (!label) {
      warnings.push(`Узел id="${id}": нет label — пропущен`);
      continue;
    }

    const description =
      asString(data?.description) ?? asString(rn.description) ?? "";

    const rawType = asString(rn.type);
    const type =
      format === "C"
        ? rawType === "transformation"
          ? "transformation"
          : "product"
        : rawType ?? "product";

    const position = asPosition(rn.position) ?? { x: 0, y: 0 };

    usedIds.add(id);

    const mergedData: Record<string, unknown> = {
      ...(data ?? {}),
      label,
      description,
    };

    nodes.push({
      id,
      type,
      position,
      data: mergedData as CustomNode["data"],
    } as CustomNode);
  }

  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const edges: Edge[] = [];
  let droppedEdges = 0;
  const seenEdgeIds = new Set<string>();

  for (const re of rawEdges) {
    if (!isObject(re)) {
      droppedEdges++;
      continue;
    }
    const source = asString(re.source);
    const target = asString(re.target);
    if (!source || !target) {
      droppedEdges++;
      continue;
    }
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) {
      droppedEdges++;
      continue;
    }

    let id = asString(re.id);
    if (!id || seenEdgeIds.has(id)) id = crypto.randomUUID();
    seenEdgeIds.add(id);

    const type = asString(re.type) ?? "straight";
    const edge: Edge = { id, source, target, type };
    if (typeof re.sourceHandle === "string") edge.sourceHandle = re.sourceHandle;
    if (typeof re.targetHandle === "string") edge.targetHandle = re.targetHandle;
    edges.push(edge);
  }

  if (droppedEdges > 0) {
    warnings.push(`Отброшено ${droppedEdges} рёбер с битыми/несуществующими ссылками`);
  }

  const positions = nodes.map((n) => n.position);
  const allZero =
    positions.length > 0 && positions.every((p) => p.x === 0 && p.y === 0);
  const allSame =
    positions.length > 1 &&
    positions.every(
      (p) => p.x === positions[0].x && p.y === positions[0].y,
    );
  const needsLayout = nodes.length > 0 && (allZero || allSame);

  return {
    payload: {
      nodes,
      edges,
      leafNodes: leafNodes.filter((id) => nodeIdSet.has(id)),
      hasMore,
      originalPrompt,
    },
    warnings,
    needsLayout,
  };
}
