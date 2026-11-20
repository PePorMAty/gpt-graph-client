// Мастер шага на автопилоте — по просьбе чата с ИИ (PG-MIGRATION.md, 4.4).
//
// Мастер проходит свои этапы сам, теми же действиями, что кнопки:
// направление → источники (сначала из базы, иначе поиск моделью) → обобщение
// → построение → превью. Дальше по заданию: «preview» — остановиться на
// превью, решает человек (чат в режиме с подтверждением); «add» — нажать
// «Добавить шаг» (автопилот); «sources» — только найти источники («найди
// источники для X»; web — поиском моделью в интернете, даже если в базе
// есть). Вся логика шага — та же, что у человека: источники из базы,
// проверки, раскладка.
//
// Задание одно на всё приложение: шаг строится у выбранного узла, а узел
// выбран один. Каждый этап мастера (FlowPanel, StepByStepContent,
// StepPreviewModal) смотрит, есть ли задание для него, делает свой ход и
// сообщает итог через finishAutoStep. Человек закрыл мастер — задание
// снимается: решать за него, когда он ушёл, нельзя.

export type AutoStepUntil = "preview" | "add" | "sources";

export interface AutoStepResult {
  status: "preview" | "added" | "sources" | "failed" | "cancelled";
  error?: string;
  /** Найденные источники (until: «sources») — названия, первые. */
  sources?: string[];
  sourcesCount?: number;
}

interface Run {
  nodeId: string;
  direction: "up" | "down";
  until: AutoStepUntil;
  /** Искать моделью в интернете; снимается, когда поиск запущен. */
  web: boolean;
  resolve: (r: AutoStepResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Дольше этого шаг не строится: поиск моделью — минуты, обобщение и построение — ещё минуты. */
const LIMIT_MS = 15 * 60 * 1000;

let run: Run | null = null;

/** Начать: мастер у узла nodeId пройдёт шаг в направлении direction. Прежнее задание снимается. */
export function startAutoStep(
  nodeId: string,
  direction: "up" | "down",
  until: AutoStepUntil,
  { web = false }: { web?: boolean } = {},
): Promise<AutoStepResult> {
  cancelAutoStep();
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => finishAutoStep({ status: "failed", error: "шаг строится дольше 15 минут — смотрите мастер" }),
      LIMIT_MS,
    );
    run = { nodeId, direction, until, web, resolve, timer };
  });
}

/**
 * Нужен ли ещё поиск в интернете. true — забрать: поиск запускает тот экран
 * мастера, что спросил, второй раз его не запустят.
 */
export function takeAutoWebSearch(): boolean {
  if (!run?.web) return false;
  run.web = false;
  return true;
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
