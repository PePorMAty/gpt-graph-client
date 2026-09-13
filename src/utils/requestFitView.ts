/** Имя события: просьба вписать граф в экран. */
const FIT_VIEW_EVENT = "graph-fit-view";

/**
 * Попросить полотно вписать граф в экран.
 *
 * Полотно смонтировано всегда (см. App.tsx), но живёт отдельно от экранов,
 * которые кладут в него граф — библиотеки, объединения. Прямой ссылки на
 * useReactFlow у них нет, поэтому камерой управляем через событие окна.
 */
export function requestFitView(): void {
  window.dispatchEvent(new CustomEvent(FIT_VIEW_EVENT));
}

/** Подписка на просьбу вписать граф; возвращает функцию отписки. */
export function onFitViewRequest(handler: () => void): () => void {
  window.addEventListener(FIT_VIEW_EVENT, handler);
  return () => window.removeEventListener(FIT_VIEW_EVENT, handler);
}
