import type { Edge } from "@xyflow/react";
import type { CustomNode } from "../types";
import type { SavedSourcesBlock } from "../store/types";
import { reconstructPresentationColors } from "./presentationColors";

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
  /** Список уникальных презентаций (в порядке появления) — собирается
   * из массива `Презентации` (формат D), поля `presentation` (формат E)
   * и из `node.data.presentations` (для сохранённых на сервер graph'ов,
   * формат A/B/C — узлы несут эту информацию через data). */
  presentations: string[];
  /** Заголовок презентации: «Название презентации» (D), `presentationName`
   * (E), либо `meta.name` / `meta.prompt` (A). Используется как имя
   * единственной презентации для старых graph'ов без `data.presentations`. */
  presentationTitle: string | null;
  /** Реконструированный реестр «презентация → цвет» из узлов, если
   * они несут `data.presentationColor`. Пуст если ничего не нашлось. */
  presentationColors?: Record<string, string>;
  /** Блок источников из `state.sources` (новые сейвы). Для старых файлов
   * отсутствует — пул реконструируется из понодовых данных. */
  sources?: SavedSourcesBlock;
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

    // labelsByPresentation: один и тот же label для всех презентаций этого
    // узла (в format D у каждого узла одно написание во всех его презентациях).
    const labelsByPresentation: Record<string, string> = {};
    for (const p of nodePresentations) labelsByPresentation[p] = label;

    usedIds.add(id);
    nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: {
        label,
        description: "",
        presentations: nodePresentations,
        ...(type === "product" &&
        Object.keys(labelsByPresentation).length > 0
          ? { labelsByPresentation }
          : {}),
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

  // Фиктивная слоёвка: если все узлы на одном layer, убираем его
  const ruLayerValues = new Set(
    nodes
      .map((n) => (n.data as Record<string, unknown>)?.layer)
      .filter((v) => typeof v === "number"),
  );
  if (ruLayerValues.size <= 1 && nodes.length > 0) {
    for (const n of nodes) {
      const d = n.data as Record<string, unknown>;
      if (d && "layer" in d) delete d.layer;
    }
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
  let sources: SavedSourcesBlock | undefined;

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
    // Заголовок презентации для скачанных с сервера сохранённых графов:
    // приоритет на meta.name (заданное пользователем имя), fallback —
    // meta.prompt. Используется как имя единственной презентации, если
    // узлы не несут собственного data.presentations.
    presentationTitle =
      (meta ? asString(meta.name) : null) ??
      (meta ? asString(meta.prompt) : null);

    const state = isObject(parsed.state) ? parsed.state : null;
    if (state && Array.isArray(state.leaf_nodes)) {
      leafNodes = state.leaf_nodes.filter(
        (s): s is string => typeof s === "string",
      );
    }
    hasMore = !!state?.has_more;
    if (state && isObject(state.sources)) {
      sources = state.sources as unknown as SavedSourcesBlock;
    }
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

  // Если все узлы имеют одинаковый layer — это фиктивная слоёвка
  // (граф без реальных слоёв). Убираем layer, чтобы при merge
  // эти узлы не получали anchor-ограничения и не ломали layout
  // мультислойного графа.
  const layerValues = new Set(
    nodes
      .map((n) => (n.data as Record<string, unknown>)?.layer)
      .filter((v) => typeof v === "number"),
  );
  if (layerValues.size <= 1 && nodes.length > 0) {
    for (const n of nodes) {
      const d = n.data as Record<string, unknown>;
      if (d && "layer" in d) delete d.layer;
    }
  }

  // Сбор presentations из data.presentations узлов — нужно для
  // форматов A/B/C, где парсер не собирает имена явно (в отличие от
  // D и E). Это критично для скачанных с сервера объединённых графов:
  // их узлы несут data.presentations, но без этого блока registry
  // строился бы пустым.
  const seenInData = new Set<string>(presentations);
  for (const n of nodes) {
    if (n.type !== "product") continue;
    const pres = (n.data as Record<string, unknown>)?.presentations;
    if (!Array.isArray(pres)) continue;
    for (const p of pres) {
      if (typeof p !== "string") continue;
      const trimmed = p.trim();
      if (!trimmed || seenInData.has(trimmed)) continue;
      seenInData.add(trimmed);
      presentations.push(trimmed);
    }
  }

  // Fallback для старых graph'ов без data.presentations (GPT-generated
  // или ранние сохранённые) — даём всем product-узлам единую презентацию,
  // совпадающую с meta.name/meta.prompt (для format A) или
  // presentationName (для format E). Без этого при последующем merge
  // с другим скачанным графом цвета не различались бы.
  if (presentations.length === 0 && presentationTitle) {
    presentations.push(presentationTitle);
    for (const n of nodes) {
      if (n.type !== "product") continue;
      const d = n.data as Record<string, unknown>;
      if (Array.isArray(d.presentations) && d.presentations.length > 0) continue;
      d.presentations = [presentationTitle];
    }
  }

  // labelsByPresentation: если узел его ещё не несёт (общий цикл A/B/C/E
  // не заполнял его выше), сгенерируем по правилу «label одинаков для
  // всех презентаций этого узла». Для скачанных с сервера merged-графов
  // labelsByPresentation уже лежит в data.* — переиспользуем через спред.
  for (const n of nodes) {
    if (n.type !== "product") continue;
    const d = n.data as Record<string, unknown>;
    if (
      isObject(d.labelsByPresentation) &&
      Object.keys(d.labelsByPresentation as RawObject).length > 0
    )
      continue;
    const pres = Array.isArray(d.presentations)
      ? (d.presentations as string[])
      : [];
    const label = typeof d.label === "string" ? d.label : "";
    if (pres.length === 0 || !label) continue;
    const labelsByPresentation: Record<string, string> = {};
    for (const p of pres) labelsByPresentation[p] = label;
    d.labelsByPresentation = labelsByPresentation;
  }

  // Реконструкция реестра цветов из узлов: если у них в data есть
  // presentationColor, восстановим исходный mapping. Иначе вернётся {}
  // и UploadGraphTab построит свежий через assignColorsForPresentations.
  const reconstructed = reconstructPresentationColors(nodes);
  const presentationColors =
    Object.keys(reconstructed).length > 0 ? reconstructed : undefined;

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
    presentationColors,
    sources,
  };
}
