import type { Middleware } from "@reduxjs/toolkit";

import type { RootState } from "../store";
import type { CustomNode } from "../../types";
import { getGraphData } from "../api/graph-api";
import {
  pushHistory,
  clearHistory,
  type HistoryEntry,
} from "../slices/historySlice";

type Entry = Omit<HistoryEntry, "id" | "at">;

/** Подпись узла по id — для читаемых записей вроде «Удалён узел «Этилен»». */
function labelOf(nodes: CustomNode[], id: string): string {
  const node = nodes.find((n) => n.id === id);
  const label = node?.data?.label;
  return typeof label === "string" && label.trim() ? label : id;
}

/** «Этилен», «Этилен и ещё 3» — короткая сводка по списку узлов. */
function summarize(nodes: CustomNode[], ids: string[]): string {
  if (!ids.length) return "";
  const first = labelOf(nodes, ids[0]);
  return ids.length === 1 ? `«${first}»` : `«${first}» и ещё ${ids.length - 1}`;
}

/** Действия, после которых история текущего полотна теряет смысл. */
function resetsHistory(type: string, before: RootState, after: RootState) {
  if (type === "graph/loadGraphFromFile") return true;
  if (getGraphData.fulfilled.type === type) return true;
  // setGraphData с пустым графом — это очистка полотна; раскладка тем же
  // экшеном узлы не теряет, её сбрасывать не надо.
  return (
    type === "graph/setGraphData" &&
    after.graph.data.nodes.length === 0 &&
    before.graph.data.nodes.length > 0
  );
}

/**
 * Что записать в историю по этому действию. null — действие неинтересное.
 *
 * Состояние до и после нужно обоим концам: имена удаляемых узлов читаются
 * только из «до», а количество добавленных — только из разницы.
 */
function describe(
  type: string,
  payload: unknown,
  before: RootState,
  after: RootState,
): Entry | null {
  const prevNodes = before.graph.data.nodes;
  const nextNodes = after.graph.data.nodes;
  const added = nextNodes.length - prevNodes.length;
  const addedEdges = after.graph.data.edges.length - before.graph.data.edges.length;

  switch (type) {
    case "graph/loadGraphFromFile":
      return {
        kind: "open",
        title: "Граф открыт",
        details: `${nextNodes.length} узлов, ${after.graph.data.edges.length} связей`,
      };

    case getGraphData.fulfilled.type:
      return {
        kind: "create",
        title: "Граф построен по запросу",
        details: after.graph.originalPrompt ?? undefined,
      };

    case "graph/mergeGraphFromFile":
      return {
        kind: "merge",
        title: "Присоединён граф",
        details: `добавлено узлов: ${Math.max(added, 0)}`,
      };

    case "graph/setGraphData":
      if (nextNodes.length === 0 && prevNodes.length > 0) {
        return { kind: "clear", title: "Полотно очищено" };
      }
      return null;

    case "graph/addNode": {
      const node = nextNodes[nextNodes.length - 1];
      const p = payload as { type?: string; label?: string } | undefined;
      return {
        kind: "add",
        title: p?.type === "transformation" ? "Добавлено преобразование" : "Добавлен продукт",
        details: p?.label ? `«${p.label}»` : undefined,
        nodeIds: node ? [node.id] : undefined,
      };
    }

    case "graph/removeNode": {
      const id = payload as string;
      return {
        kind: "remove",
        title: "Узел удалён",
        details: `«${labelOf(prevNodes, id)}»`,
      };
    }

    case "graph/removeNodes": {
      const ids = (payload as string[]) ?? [];
      if (!ids.length) return null;
      return {
        kind: "remove",
        title: ids.length === 1 ? "Узел удалён" : `Удалено узлов: ${ids.length}`,
        details: summarize(prevNodes, ids),
      };
    }

    case "graph/updateNodeData": {
      const p = payload as
        | { nodeId: string; data: Record<string, unknown> }
        | undefined;
      if (!p) return null;
      const was = prevNodes.find((n) => n.id === p.nodeId);
      // Пишем только смысловые правки: подпись и описание. Прочие поля
      // (источники, техописание, флаги) приходят пачками и залили бы историю.
      if (typeof p.data.label === "string" && p.data.label !== was?.data?.label) {
        return {
          kind: "edit",
          title: "Узел переименован",
          details: `«${was?.data?.label ?? "—"}» → «${p.data.label}»`,
          nodeIds: [p.nodeId],
        };
      }
      if (
        typeof p.data.description === "string" &&
        p.data.description !== was?.data?.description
      ) {
        return {
          kind: "edit",
          title: "Изменено описание узла",
          details: `«${labelOf(prevNodes, p.nodeId)}»`,
          nodeIds: [p.nodeId],
        };
      }
      // Идентификатор — ключ, по которому продукты схлопываются при
      // объединении графов. Правка тихой быть не должна: после неё два узла
      // могут стать одним, и надо видеть, с чего это началось.
      if (
        typeof p.data.productId === "string" &&
        p.data.productId !== (was?.data?.productId ?? "")
      ) {
        const name = labelOf(prevNodes, p.nodeId);
        const wasId =
          typeof was?.data?.productId === "string" ? was.data.productId : "";
        return {
          kind: "edit",
          title: p.data.productId ? "Задан идентификатор" : "Убран идентификатор",
          details: p.data.productId
            ? `«${name}» → ${p.data.productId}`
            : `«${name}»${wasId ? ` (был ${wasId})` : ""}`,
          nodeIds: [p.nodeId],
        };
      }
      return null;
    }

    case "graph/setGraphName":
      return {
        kind: "edit",
        title: "Граф переименован",
        details: after.graph.originalPrompt ?? undefined,
      };

    case "graph/onConnect": {
      const p = payload as { source?: string; target?: string } | undefined;
      if (!p?.source || !p?.target) return null;
      return {
        kind: "link",
        title: "Добавлена связь",
        details: `«${labelOf(nextNodes, p.source)}» → «${labelOf(nextNodes, p.target)}»`,
        nodeIds: [p.source, p.target],
      };
    }

    case "graph/removeEdge":
      return { kind: "link", title: "Связь удалена" };

    case "graph/acceptPendingStep":
      return {
        kind: "step",
        title: "Шаг принят",
        details:
          added > 0
            ? `новых узлов: ${added}, связей: ${Math.max(addedEdges, 0)}`
            : undefined,
      };

    case "graph/rejectPendingStep":
      return { kind: "step", title: "Шаг отклонён" };

    case "graph/undoLastStep":
      return {
        kind: "step",
        title: "Последний шаг отменён",
        details: added < 0 ? `убрано узлов: ${-added}` : undefined,
      };

    case "graph/createStepAlternativeNodes": {
      const p = payload as
        | { nodeId: string; alternatives?: unknown[] }
        | undefined;
      return {
        kind: "add",
        title: "Добавлены альтернативы",
        details: `${p?.alternatives?.length ?? 0} для «${labelOf(prevNodes, p?.nodeId ?? "")}»`,
        nodeIds: p?.nodeId ? [p.nodeId] : undefined,
      };
    }

    case "graph/removeStepAlternativeNodes": {
      const p = payload as { nodeId: string } | undefined;
      return {
        kind: "remove",
        title: "Альтернативы убраны",
        details: p?.nodeId ? `«${labelOf(prevNodes, p.nodeId)}»` : undefined,
        nodeIds: p?.nodeId ? [p.nodeId] : undefined,
      };
    }

    case "graph/insertTransformationBetween":
    case "graph/insertTransformationsForNeighbors":
      return {
        kind: "add",
        title: "Вставлено преобразование",
        details: added > 0 ? `новых узлов: ${added}` : undefined,
      };

    case "savedGraphs/markGraphSaved":
      // Снятие пометки «не сохранено» после открытия графа сохранением не
      // является: иначе у каждого открытого графа в истории заводилась запись
      // «Граф сохранён», которой не соответствует никакая запись на сервер.
      if ((payload as { opened?: boolean })?.opened) return null;
      return {
        kind: "save",
        title: "Граф сохранён",
        details: after.savedGraphs.openedGraphName ?? undefined,
      };

    default:
      return null;
  }
}

/**
 * История действий над графом (раздел «История» левого рельса).
 *
 * Живёт в middleware, а не в компонентах: действия приходят из карточки узла,
 * контекстных меню, полотна и библиотеки — собрать их в одном месте можно
 * только на уровне стора. Записи читаются и из «до», и из «после», поэтому
 * состояние снимается по обе стороны от next().
 */
export const historyMiddleware: Middleware =
  (store) => (next) => (action) => {
    const type = (action as { type?: string }).type;
    if (typeof type !== "string" || type.startsWith("history/")) {
      return next(action);
    }

    const before = store.getState() as RootState;
    const result = next(action);
    const after = store.getState() as RootState;

    // Смена графа обнуляет историю: она про то, что делали с этим полотном.
    if (resetsHistory(type, before, after)) {
      store.dispatch(clearHistory());
    }

    const entry = describe(
      type,
      (action as { payload?: unknown }).payload,
      before,
      after,
    );
    if (entry) store.dispatch(pushHistory(entry));

    return result;
  };
