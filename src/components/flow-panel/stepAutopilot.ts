// Мастер шага на автопилоте — по просьбе чата с ИИ (PG-MIGRATION.md, 4.4).
//
// Мастер проходит свои этапы сам, теми же действиями, что кнопки:
// направление → источники (сначала из базы, иначе поиск моделью) → обобщение
// → построение → превью. Дальше по заданию: «preview» — остановиться на
// превью, решает человек (чат в режиме с подтверждением); «add» — нажать
// «Добавить шаг» (автопилот). Вся логика шага — та же, что у человека:
// источники из базы, проверки, раскладка.
//
// Задание одно на всё приложение: шаг строится у выбранного узла, а узел
// выбран один. Каждый этап мастера (FlowPanel, StepByStepContent,
// StepPreviewModal) смотрит, есть ли задание для него, делает свой ход и
// сообщает итог через finishAutoStep. Человек закрыл мастер — задание
// снимается: решать за него, когда он ушёл, нельзя.

export type AutoStepUntil = "preview" | "add";

export interface AutoStepResult {
  status: "preview" | "added" | "failed" | "cancelled";
  error?: string;
}

interface Run {
  nodeId: string;
  direction: "up" | "down";
  until: AutoStepUntil;
  resolve: (r: AutoStepResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Дольше этого шаг не строится: поиск моделью — минуты, обобщение и построение — ещё минуты. */
const LIMIT_MS = 15 * 60 * 1000;

let run: Run | null = null;

/** Начать: мастер у узла nodeId пройдёт шаг в направлении direction. Прежнее задание снимается. */
export function startAutoStep(nodeId: string, direction: "up" | "down", until: AutoStepUntil): Promise<AutoStepResult> {
  cancelAutoStep();
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => finishAutoStep({ status: "failed", error: "шаг строится дольше 15 минут — смотрите мастер" }),
      LIMIT_MS,
    );
    run = { nodeId, direction, until, resolve, timer };
  });
}

/** Задание для мастера этого узла: что делать и в каком направлении. null — мастер ведёт человек. */
export function autoStepFor(nodeId: string | null | undefined): { direction: "up" | "down"; until: AutoStepUntil } | null {
  return run && nodeId && run.nodeId === nodeId ? { direction: run.direction, until: run.until } : null;
}

/** Задание ещё идёт — этапу мастера можно делать ход. */
export const autoStepActive = () => run !== null;

export function finishAutoStep(result: AutoStepResult): void {
  if (!run) return;
  const { resolve, timer } = run;
  run = null;
  clearTimeout(timer);
  resolve(result);
}

export function cancelAutoStep(): void {
  finishAutoStep({ status: "cancelled" });
}
