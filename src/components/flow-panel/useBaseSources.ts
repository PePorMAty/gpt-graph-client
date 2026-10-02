import { useEffect, useState } from "react";

import { fetchBaseSources } from "../../store/api/local-sources-api";
import { useAppSelector } from "../../store/hooks";
import type { BuildDirection, TechnologySource } from "../../store/types";

interface BaseSourcesState {
  /** Для какого продукта и направления ответ — чтобы не показать чужой. */
  key: string;
  status: "loading" | "done" | "failed";
  /** PDF первыми, затем найденное моделью раньше. */
  sources: TechnologySource[];
}

/**
 * Источники продукта в базе сервера — для мастера построения шага.
 *
 * Спрашиваем, когда выбрано направление, и заново — когда база изменилась
 * (загрузили PDF, модель что-то нашла). Сервер без базы источников (ещё не
 * обновлён) отвечает ошибкой — тогда мастер работает, как раньше.
 */
export function useBaseSources(
  productName: string,
  direction: BuildDirection | null,
): BaseSourcesState {
  const version = useAppSelector((s) => s.localSources.version);
  const key = direction && productName ? `${productName}::${direction}` : "";
  const [state, setState] = useState<BaseSourcesState>({
    key: "",
    status: "loading",
    sources: [],
  });

  useEffect(() => {
    if (!key || !direction) return;
    let cancelled = false;
    fetchBaseSources(productName, direction)
      .then(({ local, web }) => {
        if (!cancelled) setState({ key, status: "done", sources: [...local, ...web] });
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: "failed", sources: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key, productName, direction, version]);

  // Ответ по прошлому продукту или направлению — ещё не наш.
  return state.key === key ? state : { key, status: "loading", sources: [] };
}
