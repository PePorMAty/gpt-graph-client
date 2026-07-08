import { createContext, useContext } from "react";
import type { BuildDirection, DesignVariant } from "../../store/types";

/**
 * Действия/контекст, доступные кастомным нодам ReactFlow (в частности ProductNode).
 * ReactFlow не пробрасывает произвольные колбэки в ноды, а класть функции в
 * `node.data` нельзя (data сериализуется в localStorage). Поэтому пробрасываем
 * через React-контекст, провайдер оборачивает <ReactFlow> в Flow.tsx.
 */
export interface NodeActions {
  /** Активный вариант дизайна точки входа build (A/B/C). */
  variant: DesignVariant;
  /** true — граф в режиме просмотра, build-аффордансы на ноде скрыты. */
  readOnly: boolean;
  /** Открыть панель построения для ноды в заданном направлении. */
  openBuild: (nodeId: string, direction: BuildDirection) => void;
}

const NodeActionsContext = createContext<NodeActions | null>(null);

export const NodeActionsProvider = NodeActionsContext.Provider;

export function useNodeActions(): NodeActions | null {
  return useContext(NodeActionsContext);
}
