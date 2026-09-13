import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import { onNodesChange } from "../store/slices/gptSlice";

/**
 * Показать узел на полотне: подвести камеру, выделить его синим и подсветить.
 *
 * Тот же результат, что и клик по узлу, но без открытия карточки — нужен
 * поиску в шапке и списку закладок. Выделение делаем исключительным: снимаем
 * его со всех остальных узлов, иначе поверх прошлого выбора копился новый.
 */
export function useFocusNode() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const { setCenter } = useReactFlow();

  return useCallback(
    (nodeId: string, opts?: { zoom?: number }) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const width = node.measured?.width ?? 0;
      const height = node.measured?.height ?? 0;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: opts?.zoom ?? 1.3,
        duration: 600,
      });

      dispatch(
        onNodesChange(
          nodes
            .filter((n) => n.selected || n.id === nodeId)
            .map((n) => ({
              id: n.id,
              type: "select" as const,
              selected: n.id === nodeId,
            })),
        ),
      );

      window.dispatchEvent(
        new CustomEvent("highlight-node", { detail: nodeId }),
      );
    },
    [nodes, dispatch, setCenter],
  );
}
