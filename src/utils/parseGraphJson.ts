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
  /** Список уникальных презентаций (в порядке появления) — заполняется только для русскоязычного формата с полем `Презентации` / `Из какой презентации`. */
  presentations: string[];
  /** Заголовок презентации из поля `Название презентации` — только для русскоязычного формата. */
  presentationTitle: string | null;
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

function detectFormat(parsed: RawObject): "A" | "B" | "C" | "D" | "E" {
  // Format D: русскоязычный иерархический граф презентаций
  if (Array.isArray(parsed["Цепочка"]) && Array.isArray(parsed["Связи"])) {
    return "D";
  }

  const graph = parsed.graph;
  if (isObject(graph) && Array.isArray(graph.nodes)) return "A";

  if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
    // Format E: иерархический граф презентации с английскими ключами
    // (presentationName в корне + presentation у узлов).
    const hasPresentationName = typeof parsed.presentationName === "string";
    const sample = (parsed.nodes as unknown[])[0];
    const sampleHasPresentation =
      isObject(sample) && typeof sample.presentation === "string";
    if (hasPresentationName || sampleHasPresentation) {
      return "E";
    }

    const hasInternalKeys =
      typeof parsed.prompt === "string" ||
      Array.isArray(parsed.leaf_nodes) ||
      typeof parsed.has_more === "boolean";

    const sampleLooksInternal =
      isObject(sample) &&
      (isObject(sample.data) ||
        isObject(sample.position) ||
        typeof sample.sourcePosition === "string");

    return hasInternalKeys || sampleLooksInternal ? "B" : "C";
  }

  return "C";
}

const RU_TYPE_MAP: Record<string, "product" | "transformation"> = {
  Продукт: "product",
  Преобразование: "transformation",
};

function parseRussianFormat(
  parsed: RawObject,
  warnings: string[],
): {
  nodes: CustomNode[];
  edges: Edge[];
  presentations: string[];
  presentationTitle: string | null;
} {
  const rawNodes = Array.isArray(parsed["Цепочка"])
    ? (parsed["Цепочка"] as unknown[])
    : [];
  const rawEdges = Array.isArray(parsed["Связи"])
    ? (parsed["Связи"] as unknown[])
    : [];
  const presentationTitle = asString(parsed["Название презентации"]);

  const seenPres = new Set<string>();
  const presentations: string[] = [];
  const recordPres = (p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    if (seenPres.has(trimmed)) return;
    seenPres.add(trimmed);
    presentations.push(trimmed);
  };

  const nodes: CustomNode[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < rawNodes.length; i++) {
    const raw = rawNodes[i];
    if (!isObject(raw)) {
      warnings.push(`Узел #${i}: не объект — пропущен`);
      continue;
    }
    const id = asString(raw["Id узла"]);
    const label = asString(raw["Название узла"]);
    if (!id) {
      warnings.push(`Узел #${i}: нет 'Id узла' — пропущен`);
      continue;
    }
    if (!label) {
      warnings.push(`Узел id="${id}": нет 'Название узла' — пропущен`);
      continue;
    }
    if (usedIds.has(id)) {
      warnings.push(`Узел id="${id}": дубликат — пропущен`);
      continue;
    }

    const typeRaw = asString(raw["Тип узла"]) ?? "";
    const type: "product" | "transformation" =
      RU_TYPE_MAP[typeRaw] ?? "product";

    let nodePresentations: string[] = [];
    const presArr = raw["Презентации"];
    if (Array.isArray(presArr) && presArr.length > 0) {
      nodePresentations = (presArr as unknown[])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p): p is string => Boolean(p));
    } else {
      const presStr = asString(raw["Из какой презентации"]) ?? "";
      nodePresentations = presStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (nodePresentations.length === 0 && presentationTitle) {
      nodePresentations = [presentationTitle];
    }
    nodePresentations.forEach(recordPres);

    const layerRaw = raw["Слой"];
    const layer = typeof layerRaw === "number" ? layerRaw : undefined;

    usedIds.add(id);
    nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: {
        label,
        description: "",
        presentations: nodePresentations,
        ...(layer !== undefined && { layer }),
      },
    } as CustomNode);
  }

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  const seenEdgeIds = new Set<string>();
  let droppedEdges = 0;
  for (const raw of rawEdges) {
    if (!isObject(raw)) {
      droppedEdges++;
      continue;
    }
    const source = asString(raw["Откуда"]);
    const target = asString(raw["Куда"]);
    if (!source || !target) {
      droppedEdges++;
      continue;
    }
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) {
      droppedEdges++;
      continue;
    }
    let id = asString(raw["Id связи"]);
    if (!id || seenEdgeIds.has(id)) id = crypto.randomUUID();
    seenEdgeIds.add(id);
    edges.push({ id, source, target, type: "straight" });
  }
  if (droppedEdges > 0) {
    warnings.push(
      `Отброшено ${droppedEdges} рёбер с битыми/несуществующими ссылками`,
    );
  }

  return { nodes, edges, presentations, presentationTitle };
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
  let presentations: string[] = [];
  let presentationTitle: string | null = null;

  if (format === "D") {
    const ru = parseRussianFormat(parsed, warnings);
    presentations = ru.presentations;
    presentationTitle = ru.presentationTitle;

    const positions = ru.nodes.map((n) => n.position);
    const allZero =
      positions.length > 0 &&
      positions.every((p) => p.x === 0 && p.y === 0);
    const needsLayout = ru.nodes.length > 0 && allZero;

    return {
      payload: {
        nodes: ru.nodes,
        edges: ru.edges,
        leafNodes: [],
        hasMore: false,
        originalPrompt: presentationTitle,
      },
      warnings,
      needsLayout,
      presentations,
      presentationTitle,
    };
  }

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
  } else if (format === "E") {
    rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
    presentationTitle = asString(parsed.presentationName);
    originalPrompt = presentationTitle;
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

    const layerValue = typeof rn.layer === "number" ? rn.layer : undefined;
    if (layerValue !== undefined) {
      mergedData.layer = layerValue;
    }

    // Format E: вытаскиваем презентацию из поля node.presentation
    // (фоллбэк — корневое presentationName из ParseResult.presentationTitle).
    if (format === "E") {
      const presentation =
        asString(rn.presentation) ?? presentationTitle ?? null;
      if (presentation) {
        const trimmed = presentation.trim();
        if (trimmed) {
          mergedData.presentations = [trimmed];
          if (!presentations.includes(trimmed)) {
            presentations.push(trimmed);
          }
        }
      }
    }

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
    presentations,
    presentationTitle,
  };
}
