import { useCallback, useSyncExternalStore } from "react";
import {
  getSoundVolume,
  isSoundEnabled,
  playChime,
  setSoundEnabled,
  setSoundVolume,
} from "./chime";

export type ToastKind = "success" | "error" | "info";

/** Узел, о котором уведомление: по нему из ленты переходят к продукту. */
export type ToastTarget = { nodeId: string; label?: string };

export type Toast = {
  id: number;
  kind: ToastKind;
  text: string;
  /**
   * Вторая строка: пояснение и техническая причина.
   *
   * В тост не помещается — он живёт секунды и должен читаться с одного взгляда;
   * показывается в ленте под колокольчиком, где отказ и разбирают.
   */
  detail?: string;
  target?: ToastTarget;
};
/**
 * Запись в ленте уведомлений: тот же тост, но со временем и без автоскрытия.
 * canvas — полотно, к которому уведомление относится (см. setNotificationCanvas).
 */
export type NotificationRecord = Toast & { at: string; canvas: string };

export interface ShowToastOptions {
  /** Узел, о котором уведомление. */
  target?: ToastTarget;
  /**
   * Полотно, для которого шёл запрос. Не задано — текущее. Отличается от
   * текущего, когда ответ пришёл после того, как граф закрыли.
   */
  canvas?: string;
}

// ─── Чьё это уведомление ───
// Лента была общей на всю вкладку: открыл новый граф — и видишь «Шаг
// построен» с прошлого, а ответ на запрос закрытого графа всплывал поверх
// нового. Теперь каждое уведомление помнит своё полотно, лента показывает
// только текущее, а ответ для закрытого графа не всплывает.
let currentCanvas = "canvas-1";

/** Сменилось полотно: открыт другой граф, создан новый, полотно очищено. */
export function setNotificationCanvas(key: string) {
  if (key === currentCanvas) return;
  currentCanvas = key;
  // Всплывшие тосты прошлого полотна гасим сразу: к новому они отношения не
  // имеют.
  if (toasts.length) {
    toasts = [];
    emit();
  }
  refreshVisible();
}

export function getNotificationCanvas(): string {
  return currentCanvas;
}

// Ошибку держим дольше: её нужно успеть прочитать.
const AUTO_HIDE_MS: Record<ToastKind, number> = {
  success: 5000,
  info: 5000,
  error: 9000,
};

// Стор вне React: тосты показывает redux-middleware, у которого нет доступа
// к хукам компонентов.
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Toast[] {
  return toasts;
}

export function dismissToast(id: number) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function showToast(
  kind: ToastKind,
  text: string,
  detail?: string,
  opts?: ShowToastOptions,
): number {
  const id = nextId++;
  const canvas = opts?.canvas ?? currentCanvas;
  const target = opts?.target;
  pushHistory({
    id,
    kind,
    text,
    detail,
    ...(target ? { target } : {}),
    at: new Date().toISOString(),
    canvas,
  });
  // Ответ для закрытого графа в ленту своего полотна ложится, а поверх
  // нового не всплывает.
  if (canvas !== currentCanvas) return id;
  // Больше трёх одновременно — стена вместо уведомлений.
  toasts = [...toasts, { id, kind, text, detail, ...(target ? { target } : {}) }].slice(-3);
  emit();
  playChime(kind);
  setTimeout(() => dismissToast(id), AUTO_HIDE_MS[kind]);
  return id;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── Лента уведомлений ───
// Тост живёт несколько секунд, а длинные запросы к моделям идут минутами: за
// это время пользователь успевает уйти в другую вкладку и пропустить ответ.
// Поэтому каждое уведомление дополнительно ложится в ленту под колокольчиком.

const HISTORY_LIMIT = 50;

let history: NotificationRecord[] = [];
/** Записи текущего полотна — их и показывает лента. */
let visible: NotificationRecord[] = [];
const historyListeners = new Set<() => void>();

function subscribeHistory(listener: () => void) {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}

function getHistorySnapshot(): NotificationRecord[] {
  return visible;
}

/** Пересобрать видимую часть ленты и оповестить подписчиков. */
function refreshVisible() {
  visible = history.filter((r) => r.canvas === currentCanvas);
  historyListeners.forEach((l) => l());
}

function pushHistory(record: NotificationRecord) {
  // Новые сверху; храним ограниченное число — лента не должна расти вечно.
  history = [record, ...history].slice(0, HISTORY_LIMIT);
  refreshVisible();
}

/** Лента текущего полотна. */
export function useNotificationHistory(): NotificationRecord[] {
  return useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistorySnapshot,
  );
}

/** «Очистить» — ленту текущего полотна; чужие записи и так не видны. */
export function clearNotificationHistory() {
  if (!visible.length) return;
  history = history.filter((r) => r.canvas !== currentCanvas);
  refreshVisible();
}

// Переключатель звука живёт рядом с тостами: включают/выключают его ровно в
// тот момент, когда уведомление прозвучало.
let soundEnabled = isSoundEnabled();
const soundListeners = new Set<() => void>();

function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

function getSoundSnapshot() {
  return soundEnabled;
}

export function useSoundToggle(): [boolean, () => void] {
  const enabled = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundSnapshot,
  );
  const toggle = useCallback(() => {
    soundEnabled = !soundEnabled;
    setSoundEnabled(soundEnabled);
    soundListeners.forEach((l) => l());
  }, []);
  return [enabled, toggle];
}

// Громкость звука (0..1) — ползунок живёт в тосте рядом с колокольчиком.
let soundVolume = getSoundVolume();
const volumeListeners = new Set<() => void>();

function subscribeVolume(listener: () => void) {
  volumeListeners.add(listener);
  return () => {
    volumeListeners.delete(listener);
  };
}

function getVolumeSnapshot() {
  return soundVolume;
}

export function useSoundVolume(): [number, (volume: number) => void] {
  const volume = useSyncExternalStore(
    subscribeVolume,
    getVolumeSnapshot,
    getVolumeSnapshot,
  );
  const setVolume = useCallback((next: number) => {
    soundVolume = Math.min(1, Math.max(0, next));
    setSoundVolume(soundVolume);
    volumeListeners.forEach((l) => l());
  }, []);
  return [volume, setVolume];
}
