import { useCallback, useSyncExternalStore } from "react";
import { isSoundEnabled, playChime, setSoundEnabled } from "./chime";

export type ToastKind = "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; text: string };

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

export function showToast(kind: ToastKind, text: string): number {
  const id = nextId++;
  // Больше трёх одновременно — стена вместо уведомлений.
  toasts = [...toasts, { id, kind, text }].slice(-3);
  emit();
  playChime(kind);
  setTimeout(() => dismissToast(id), AUTO_HIDE_MS[kind]);
  return id;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
