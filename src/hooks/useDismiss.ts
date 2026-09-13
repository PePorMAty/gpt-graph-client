import { useEffect, type RefObject } from "react";

/**
 * Закрытие всплывающего слоя по Escape и клику вне него.
 *
 * Раньше эта пара эффектов копировалась в каждом меню и модалке
 * (NodeContextMenu, SourcesTableModal, FlowPanel …) — вынесено, чтобы
 * поведение везде было одинаковым.
 *
 * Слушатель клика вешается на `mousedown` и через `setTimeout(0)`: без
 * задержки тот же клик, который открыл слой, тут же его и закрывал бы.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onDismiss();
    };

    document.addEventListener("keydown", onKeyDown);
    const timer = setTimeout(
      () => document.addEventListener("mousedown", onPointerDown),
      0,
    );

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      clearTimeout(timer);
    };
  }, [ref, onDismiss, active]);
}
