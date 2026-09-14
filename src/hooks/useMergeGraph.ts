import { useCallback } from "react";
import { useStore } from "react-redux";
import type { Edge } from "@xyflow/react";

import { useAppDispatch } from "../store/hooks";
import type { RootState } from "../store/store";
import { mergeGraphFromFile } from "../store/slices/gptSlice";
import { parseGraphJson } from "../utils/parseGraphJson";
import { applyAutoLayout } from "../utils/applyAutoLayout";
import {
  assignColorsForPresentations,
  colorForPresentations,
  ensureProductPresentations,
} from "../utils/presentationColors";
import { assignTopologicalLayers } from "../utils/assignTopologicalLayers";
import { orientByBuildDirection } from "../utils/orientByBuildDirection";
import { applyHandlesByGeometry } from "../utils/normalize-edges";
import { mergeProductGraph } from "../utils/mergeProductGraph";
import { collapseDuplicateTransformations } from "../utils/collapseDuplicateTransformations";
import { markChainRoots } from "../utils/markChainRoots";
import { alignChainRoots } from "../utils/alignChainRoots";
import { reconstructSourcesPool } from "../utils/reconstructSourcesPool";
import { mergeSourcesPools } from "../utils/mergeSourcesPools";
import { separateComponentsHorizontally } from "../utils/separateComponentsHorizontally";
import type { CustomNode } from "../types";
import type { SourcesPoolEntry } from "../store/types";
import type { MergeReportRow } from "../components/upload-graph/MergeReportModal";

/** Что показать после объединения: сводка, предупреждения парсера и отчёт. */
export interface MergeOutcome {
  summary: string;
  warnings: string[];
  report: {
    presentationName: string | null;
    commonNodes: MergeReportRow[];
    addedCount: number;
  };
}

/**
 * Слепок графа, к которому присоединяют. Ровно то из `state.graph`, что нужно
 * слиянию: вынесено в тип, чтобы ту же математику можно было прогнать мимо
 * стора — для превью объединения в библиотеке.
 */
export interface MergeGraphState {
  nodes: CustomNode[];
  edges: Edge[];
  presentationColors: Record<string, string>;
  originalPrompt: string | null;
  sourcesPool: Record<string, SourcesPoolEntry>;
  sourcesSeqCounter: { up: number; down: number };
}

/** Результат слияния: новое состояние графа плюс то, что показать человеку. */
export interface MergeComputation extends MergeOutcome {
  next: MergeGraphState;
}


// Раскладка для вкладки объединения: сырьё сверху, продукты снизу.
// ELK (~1.5MB) подгружаем динамически — только когда пользователь
// реально что-то делает на этой вкладке. При сбое — фолбэк на applyAutoLayout("TB").
//
// Шаги:
// 1. orientByBuildDirection — приводим рёбра к канону «сырьё → продукт»,
//    разворачивая части, построенные «вниз» (у них якорь — конечный продукт,
//    и без разворота сырьё уходило бы вниз). Идемпотентно (флаг на ребре).
// 2. Слои синтезируем по фактической топологии (assignTopologicalLayers) уже
//    по канонической ориентации — чистое послойное размещение и для
//    продуктовых, и для step-графов (у последних нет поля «Слой»), включая
//    узлы-преобразования и изолированные ноды.
// 3. alignChainRoots — выравнивает «начальные продукты» (истоки цепочек) всех
//    объединённых графов на один горизонтальный уровень: каждую связную компоненту
//    сдвигает по вертикали так, чтобы её корень встал на общий targetY (внутренняя
//    раскладка цепочки сохраняется). Корень берётся по флагу chainBuiltRoot
//    (проставлен markChainRoots до namespacing), иначе — по эвристике-стоку.
// 4. После раскладки applyHandlesByGeometry перевыставляет хэндлы рёбер по
//    фактическим Y-координатам — в т.ч. у развёрнутых на шаге 1 рёбер.
export const layoutForMergeTab = async (
  nodes: CustomNode[],
  edges: Edge[],
): Promise<{ nodes: CustomNode[]; edges: Edge[] }> => {
  const oriented = orientByBuildDirection(nodes, edges);
  const layeredNodes = assignTopologicalLayers(nodes, oriented);
  try {
    const { layoutMergedGraphElk } = await import(
      "../utils/layoutMergedGraphElk"
    );
    const laid = await layoutMergedGraphElk(layeredNodes, oriented, {
      useLayers: true,
    });
    const aligned = alignChainRoots(laid.nodes, laid.edges);
    const spread = separateComponentsHorizontally(aligned, laid.edges);
    return {
      nodes: spread,
      edges: applyHandlesByGeometry(spread, laid.edges),
    };
  } catch (e) {
    console.warn(
      "[mergeGraph] ELK-раскладка с констрейнтами не сработала, фолбэк на dagre/longest-path:",
      e,
    );
    const laid = await applyAutoLayout(layeredNodes, oriented, "TB");
    const aligned = alignChainRoots(laid.nodes, laid.edges);
    const spread = separateComponentsHorizontally(aligned, laid.edges);
    return {
      nodes: spread,
      edges: applyHandlesByGeometry(spread, laid.edges),
    };
  }
};

/**
 * Слить граф с ещё одним — из файла или сохранённого сейва.
 *
 * Чистая функция: состояние приходит аргументом и возвращается новым, в стор
 * ничего не пишется. Так одна и та же математика обслуживает и настоящее
 * объединение (useMergeGraph), и его превью в библиотеке — превью показывает
 * ровно тот результат, который окажется на полотне.
 */
export async function computeMerge(
  current: MergeGraphState,
  input: string | unknown,
  fallbackName: string,
): Promise<MergeComputation> {
  const {
    presentationColors,
    originalPrompt,
    sourcesPool,
    sourcesSeqCounter,
  } = current;
  const data = { nodes: current.nodes, edges: current.edges };

  const result = parseGraphJson(input);
  const { payload, warnings, presentations, presentationTitle, sources: parsedSources } =
    result;

  // Существующий граф мог быть построен по шагам (узлы без data.presentations) —
  // считаем его одним источником по имени текущего графа и бэкфиллим, иначе
  // при объединении он остался бы дефолтно-синим и выпал из легенды.
  const existingSourceName =
    (originalPrompt && originalPrompt.trim()) || "Текущий граф";
  const existingBackfill = ensureProductPresentations(
    data.nodes,
    existingSourceName,
    presentationColors,
  );
  const existingNodes = existingBackfill.nodes;

  // Расширяем реестр презентациями добавляемого графа (старые цвета целы).
  let registry = assignColorsForPresentations(
    existingBackfill.registry,
    presentations,
  );

  // Слепок sources существующих product-узлов ДО merge (уже с бэкфиллом) —
  // пригодится для отчёта «какие узлы стали общими в результате добавления».
  const beforeSourcesById = new Map<string, string[]>();
  for (const n of existingNodes) {
    if (n.type !== "product") continue;
    const pres = Array.isArray(n.data?.presentations)
      ? (n.data.presentations as string[])
      : [];
    beforeSourcesById.set(n.id, pres);
  }

  // Префикс id, чтобы избежать коллизий между файлами (например, у двух
  // графов может встретиться один и тот же 'Продукт_0001').
  // Гарантированно уникальный неймспейс — два быстрых клика на «Добавить
  // граф» с Date.now() могут попасть в одну миллисекунду и дать коллизию
  // node id с предыдущим merge, из-за чего React Flow «теряет» дубли.
  // markChainRoots ДО namespacing: помечаем истоки цепочек флагом
  // chainBuiltRoot, пока id ещё совпадают с chainRootNodeId (после префиксации
  // ссылка протухает). Флаг переживает namespacing → alignChainRoots выровняет
  // начальные продукты добавляемого графа вместе с уже существующими.
  const namespace = `m${crypto.randomUUID()}__`;
  const namespacedNodes: CustomNode[] = markChainRoots(payload.nodes).map(
    (n) => ({
      ...n,
      id: namespace + n.id,
      // Ремап chainRootNodeId под новый префикс (см. handleReplaceSource).
      data:
        typeof n.data?.chainRootNodeId === "string"
          ? { ...n.data, chainRootNodeId: namespace + n.data.chainRootNodeId }
          : n.data,
    }),
  );
  const namespacedEdges = payload.edges.map((e) => ({
    ...e,
    id: namespace + e.id,
    source: namespace + e.source,
    target: namespace + e.target,
  }));

  // Бэкфилл добавляемого графа: step-граф без presentations считаем одним
  // источником по его имени (presentationTitle → имя файла/сохранённого графа).
  const incomingSourceName = presentationTitle ?? fallbackName;
  const incomingBackfill = ensureProductPresentations(
    namespacedNodes,
    incomingSourceName,
    registry,
  );
  registry = incomingBackfill.registry;

  const mergedRaw = mergeProductGraph({
    existingNodes,
    existingEdges: data.edges,
    newNodes: incomingBackfill.nodes,
    newEdges: namespacedEdges,
    registry,
  });

  // Схлопывание общих продуктов осиротило ссылки chainRootNodeId у
  // преобразований, чей анкор-продукт стал общим узлом (его id удалён). Ремапим
  // chainRootNodeId на оставшийся узел, иначе ориентация рёбер таких
  // преобразований падает в неточный фолбэк и продукт уходит не в ту сторону.
  const mergedRemapped = {
    ...mergedRaw,
    nodes: mergedRaw.nodes.map((n) => {
      const r = n.data?.chainRootNodeId;
      return typeof r === "string" && mergedRaw.idRemap[r]
        ? { ...n, data: { ...n.data, chainRootNodeId: mergedRaw.idRemap[r] } }
        : n;
    }),
  };

  // Схлопывание дублей преобразований (mergeProductGraph схлопывает только
  // продукты): одинаковые alt-узлы (тот же анкор+направление+суть) и одинаковые
  // обычные преобразования (то же имя + тот же набор связанных продуктов)
  // сливаем в одно. Делаем ПОСЛЕ ремапа chainRootNodeId — чтобы узлы от ставшего
  // общим продукта сгруппировались. Зеркалит схлопывание продуктов.
  const collapsedTr = collapseDuplicateTransformations(
    mergedRemapped.nodes,
    mergedRemapped.edges,
  );
  const merged = {
    ...mergedRemapped,
    nodes: collapsedTr.nodes,
    edges: collapsedTr.edges,
  };

  // Список узлов, у которых после merge источников стало больше, чем до.
  // Это и есть «новые общие» / «получившие новый источник» узлы.
  const reportRows: MergeReportRow[] = [];
  for (const n of merged.nodes) {
    if (n.type !== "product") continue;
    const before = beforeSourcesById.get(n.id);
    if (!before) continue; // новый узел из добавленного файла
    const after = Array.isArray(n.data?.presentations)
      ? (n.data.presentations as string[])
      : [];
    if (after.length > 1 && after.length > before.length) {
      const label = typeof n.data?.label === "string" ? n.data.label : n.id;
      const labelsByPresentation =
        typeof n.data?.labelsByPresentation === "object" &&
        n.data.labelsByPresentation
          ? (n.data.labelsByPresentation as Record<string, string>)
          : undefined;
      reportRows.push({ label, presentations: after, labelsByPresentation });
    }
  }
  reportRows.sort((a, b) => a.label.localeCompare(b.label, "ru"));

  const addedCount = merged.nodes.length - data.nodes.length;

  // Пересчёт цвета всем product-узлам — у уже существующих узлов мог
  // расшириться список презентаций, цвет должен стать общим.
  const recolored = merged.nodes.map((n) => {
    if (n.type !== "product") return n;
    const pres = Array.isArray(n.data?.presentations)
      ? (n.data.presentations as string[])
      : [];
  return {
      ...n,
      data: {
        ...n.data,
        presentationColor: colorForPresentations(pres, registry),
      },
    };
  });

  // Объединённый граф ре-лейаут-нём целиком: новые узлы без координат + старые
  // могут «съезжать» при добавлении новых рёбер. Используем ELK с
  // layerConstraint, чтобы сырьё прижалось к верхнему слою, а конечные
  // продукты — к нижнему (сугияма-разделение для объединённых графов).
  const laid = await layoutForMergeTab(recolored, merged.edges);

  // Перенумерация источников ПО НАПРАВЛЕНИЯМ: текущий пул держит номера, у
  // добавляемого графа новые продукты продолжают нумерацию (общие — один номер).
  const incomingSources =
    parsedSources ?? reconstructSourcesPool(payload.nodes);
  const combinedSources = mergeSourcesPools([
    { pool: sourcesPool, seqCounter: sourcesSeqCounter },
    incomingSources,
  ]);

  return {
    next: {
      nodes: laid.nodes,
      edges: laid.edges,
      presentationColors: registry,
      // Имя графа не меняется: основа остаётся основой.
      originalPrompt,
      sourcesPool: combinedSources.pool,
      sourcesSeqCounter: combinedSources.seqCounter,
    },
    summary: `Добавлено узлов: ${payload.nodes.length}, рёбер: ${payload.edges.length}. Итого в графе: ${laid.nodes.length} / ${laid.edges.length}.`,
    warnings,
    report: {
      presentationName: presentationTitle,
      commonNodes: reportRows,
      addedCount,
    },
  };
}

/**
 * Присоединить несколько графов по очереди, ничего не записывая в стор.
 *
 * Каждый следующий сливается с уже объединённым результатом — так же, как это
 * происходит при настоящем объединении, поэтому превью показывает именно то,
 * что окажется на полотне.
 */
export async function computeMergeChain(
  base: MergeGraphState,
  sources: { input: string | unknown; name: string }[],
): Promise<{
  state: MergeGraphState;
  commonNodes: MergeReportRow[];
  addedCount: number;
}> {
  let state = base;
  const byLabel = new Map<string, MergeReportRow>();
  for (const src of sources) {
    const step = await computeMerge(state, src.input, src.name);
    state = step.next;
    // Один и тот же продукт может стать общим на нескольких шагах — в списке
    // он должен быть один, с самым полным набором источников.
    for (const row of step.report.commonNodes) {
      const prev = byLabel.get(row.label);
      if (!prev || row.presentations.length > prev.presentations.length) {
        byLabel.set(row.label, row);
      }
    }
  }
  return {
    state,
    commonNodes: [...byLabel.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "ru"),
    ),
    addedCount: state.nodes.length - base.nodes.length,
  };
}

/**
 * Объединение с графом на полотне: считает слияние и кладёт результат в стор.
 */
export function useMergeGraph() {
  const dispatch = useAppDispatch();
  // Состояние читаем из стора в момент вызова, а не через селектор: при
  // объединении нескольких графов подряд каждый следующий должен видеть
  // результат предыдущего, а значение из замыкания осталось бы прежним —
  // и второй граф затирал бы первый.
  const store = useStore<RootState>();

  return useCallback(
    async (
      input: string | unknown,
      fallbackName: string,
    ): Promise<MergeOutcome> => {
      const graph = store.getState().graph;
      const { next, ...outcome } = await computeMerge(
        {
          nodes: graph.data.nodes,
          edges: graph.data.edges,
          presentationColors: graph.presentationColors,
          originalPrompt: graph.originalPrompt,
          sourcesPool: graph.sourcesPool,
          sourcesSeqCounter: graph.sourcesSeqCounter,
        },
        input,
        fallbackName,
      );

      dispatch(
        mergeGraphFromFile({
          nodes: next.nodes,
          edges: next.edges,
          presentationColors: next.presentationColors,
          sourcesPool: next.sourcesPool,
          sourcesSeqCounter: next.sourcesSeqCounter,
        }),
      );

      return outcome;
    },
    [store, dispatch],
  );
}
