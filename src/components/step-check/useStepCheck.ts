// src/components/step-check/useStepCheck.ts
//
// Проверка построенного шага — сама, как только открылось превью.
//
// Один запрос на шаг: ответ запоминается по id преобразования (он свой у
// каждого построения), и возврат к превью по полосе мастера или двойной
// монтаж в режиме разработки модель второй раз не спрашивают. Сервер без
// проверки (404) — плашки нет вовсе: шаг строится как раньше.

import { useEffect, useState } from "react";

import { checkStep, StepCheckUnsupported, type StepCheckResult } from "../../store/api/step-check-api";
import type { StepChainApiStep } from "../../store/types";
import { stepCheckBody } from "../../utils/stepCheck";
import type { StepCheckState } from "./StepCheckNotice";

const cache = new Map<string, Promise<StepCheckResult>>();

export function useStepCheck(
  step: StepChainApiStep,
  anchor: string,
  direction: "up" | "down",
): { state: StepCheckState | null; retry: () => void } {
  const key = step.transformation.id;
  const [attempt, setAttempt] = useState(0);
  const tag = `${key}#${attempt}`;
  // Ответ помечен запросом, для которого пришёл: другой шаг или повтор —
  // снова «проверяем», без сброса состояния в эффекте.
  const [done, setDone] = useState<{ tag: string; state: StepCheckState | null } | null>(null);

  useEffect(() => {
    let alive = true;
    let pending = cache.get(key);
    if (!pending) {
      pending = checkStep(stepCheckBody(step, anchor, direction));
      cache.set(key, pending);
      if (cache.size > 50) cache.delete(cache.keys().next().value as string);
    }
    pending.then(
      (result) => alive && setDone({ tag, state: { status: "done", result } }),
      (e: unknown) => {
        cache.delete(key);
        if (!alive) return;
        setDone({
          tag,
          state:
            e instanceof StepCheckUnsupported
              ? null
              : { status: "failed", error: e instanceof Error ? e.message : String(e) },
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, tag, step, anchor, direction]);

  return {
    state: done?.tag === tag ? done.state : { status: "loading" },
    retry: () => setAttempt((n) => n + 1),
  };
}
