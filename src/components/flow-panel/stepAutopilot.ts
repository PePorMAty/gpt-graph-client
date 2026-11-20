// Мастер шага на автопилоте — по просьбе чата с ИИ (PG-MIGRATION.md, 4.4).
//
// Мастер проходит свои этапы сам, теми же действиями, что кнопки:
// направление → источники (сначала из базы, иначе поиск моделью) → обобщение
// → построение → превью. Дальше по заданию: «preview» — остановиться на
// превью, решает человек (чат в режиме с подтверждением); «add» — нажать
// «Добавить шаг» (автопилот); «sources» — только найти источники («найди
// источники для X»; web — поиском моделью в интернете, даже если в базе
// есть); «aggregate» — до обобщения: по нему на граф встают альтернативы
// (фиолетовые варианты), а сам шаг не строится. Вся логика шага — та же,
// что у человека: источники из базы, проверки, раскладка.
//
// headless (автопилот чата, 4.6): мастер не открывается окном — Flow
// держит его скрытым (подписка subscribeAutoStep), ход виден строкой в
// чате (этап — reportAutoStage).
//
// Задание одно на всё приложение: шаг строится у выбранного узла, а узел
// выбран один. Каждый этап мастера (FlowPanel, StepByStepContent,
// StepPreviewModal) смотрит, есть ли задание для него, делает свой ход и
// сообщает итог через finishAutoStep. Человек закрыл мастер — задание
// снимается: решать за него, когда он ушёл, нельзя.

export type AutoStepUntil = "preview" | "add" | "sources" | "aggregate";

export interface AutoStepResult {
  status: "preview" | "added" | "sources" | "aggregate" | "failed" | "cancelled";
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
  snapshot: AutoStepSnapshot;
}

/** Что сейчас делает автопилот — для Flow (скрытый мастер) и строки хода в чате. */
export interface AutoStepSnapshot {
  nodeId: string;
  direction: "up" | "down";
  until: AutoStepUntil;
  headless: boolean;
  /** Этап словами: «источники из базы», «обобщение», «построение шага»… */
  stage: string;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Подписка на задание (useSyncExternalStore). */
export function subscribeAutoStep(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Текущее задание — тот же объект, пока не сменилось: снимок для React. */
export const getAutoStepSnapshot = (): AutoStepSnapshot | null => run?.snapshot ?? null;

/** Этап мастера — строкой в чат. */
export function reportAutoStage(stage: string): void {
  if (!run || run.snapshot.stage === stage) return;
  run.snapshot = { ...run.snapshot, stage };
  notify();
}

/** Дольше этого шаг не строится: поиск моделью — минуты, обобщение и построение — ещё минуты. */
const LIMIT_MS = 15 * 60 * 1000;

let run: Run | null = null;

/** Начать: мастер у узла nodeId пройдёт шаг в направлении direction. Прежнее задание снимается. */
export function startAutoStep(
  nodeId: string,
  direction: "up" | "down",
  until: AutoStepUntil,
  { web = false, headless = false }: { web?: boolean; headless?: boolean } = {},
): Promise<AutoStepResult> {
  cancelAutoStep();
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => finishAutoStep({ status: "failed", error: "шаг строится дольше 15 минут — смотрите мастер" }),
      LIMIT_MS,
    );
    run = { nodeId, direction, until, web, resolve, timer, snapshot: { nodeId, direction, until, headless, stage: "запуск" } };
    notify();
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

/**
 * Задание для мастера этого узла в карточке: что делать и в каком
 * направлении. null — мастер ведёт человек. Скрытое задание ведёт мастер
 * Flow, а не карточки: иначе мастер в открытой карточке сделал бы те же
 * ходы второй раз.
 */
export function autoStepFor(nodeId: string | null | undefined): { direction: "up" | "down"; until: AutoStepUntil } | null {
  return run && nodeId && run.nodeId === nodeId && !run.snapshot.headless ? { direction: run.direction, until: run.until } : null;
}

/** Задание ещё идёт — этапу мастера можно делать ход. */
export const autoStepActive = () => run !== null;

export function finishAutoStep(result: AutoStepResult): void {
  if (!run) return;
  const { resolve, timer } = run;
  run = null;
  clearTimeout(timer);
  notify();
  resolve(result);
}

export function cancelAutoStep(): void {
  finishAutoStep({ status: "cancelled" });
}

/** Мастеров, которые сейчас ведут задание (скрытый у Flow или в карточке). */
let hosts = 0;

/**
 * Мастер взялся за задание; вызов возвращает «мастер ушёл». Ушёл и не
 * вернулся — задание снимается: человек закрыл мастер или выбрал другой
 * узел, решать за него нельзя.
 *
 * Проверка — после паузы: StrictMode в режиме разработки (npm run dev)
 * снимает компонент и тут же ставит обратно, и задание снималось сразу
 * после старта («шаг остановлен», 20.11) — на собранном сайте этого нет.
 */
export function attachAutoHost(): () => void {
  hosts++;
  return () => {
    hosts--;
    setTimeout(() => {
      if (hosts === 0 && run) cancelAutoStep();
    }, 0);
  };
}
