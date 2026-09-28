import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Событие «открыть карточку узла» — его слушает полотно (Flow). */
export const OPEN_NODE_CARD_EVENT = "open-node-card";

/**
 * Перейти к узлу из любого места приложения: из ленты уведомлений, из
 * всплывающего тоста.
 *
 * Уведомление «Обобщение готово» говорило, что готово, но не где: на графе в
 * сотню узлов продукт приходилось искать глазами. Теперь по нему переходят —
 * экран переключается на граф, камера подлетает к узлу, открывается его
 * карточка.
 *
 * Через событие, а не через хук полотна: тосты рисуются вне провайдера
 * React Flow. Полотно смонтировано всегда (библиотека ложится поверх него),
 * поэтому событие доходит и сразу после перехода с экрана библиотеки.
 */
export function useGoToNode() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (nodeId: string) => {
      if (location.pathname !== "/") navigate("/");
      window.dispatchEvent(new CustomEvent(OPEN_NODE_CARD_EVENT, { detail: nodeId }));
    },
    [location.pathname, navigate],
  );
}
