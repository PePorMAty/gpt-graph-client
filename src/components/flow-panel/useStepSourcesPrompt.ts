// src/components/flow-panel/useStepSourcesPrompt.ts
//
// Промпт поиска источников шага по умолчанию — тот, которым ищет сервер.
//
// Окно «Редактировать промпт поиска» показывало копию из
// src/prompts/sourcesPrompt.ts, и после перехода сервера на промпты v4
// (2026-11-17) в нём оставался старый текст: без правки сервер искал по v4,
// а человек видел другое; с правкой — уходил старый текст поверх v4. Теперь
// текст берётся с сервера, когда окно открыто; своя копия — пока он грузится
// и если сервер старее и такого запроса не знает.

import { useEffect, useMemo, useState } from "react";

import { getDefaultStepSourcesPrompt } from "../../prompts/sourcesPrompt";
import { fetchStepSourcesPrompt } from "../../store/api/step-chain-api";

export function useStepSourcesPrompt(
  direction: "up" | "down",
  productName: string,
  maxItems: number,
  open: boolean,
): string {
  const key = `${direction}|${productName}|${maxItems}`;
  const local = useMemo(
    () => getDefaultStepSourcesPrompt(direction, productName, maxItems),
    [direction, productName, maxItems],
  );
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!open || !productName || loaded?.key === key) return;
    let alive = true;
    fetchStepSourcesPrompt(direction, productName, maxItems)
      .then((text) => alive && setLoaded({ key, text }))
      .catch(() => {
        // Сервер старее или не ответил — остаётся своя копия.
      });
    return () => {
      alive = false;
    };
  }, [open, key, loaded, direction, productName, maxItems]);

  return loaded?.key === key ? loaded.text : local;
}
