// Звук уведомлений синтезируется через Web Audio: не тянем аудиофайл и не
// зависим от сети — короткий тон генерируется на месте.

const SOUND_KEY = "toast-sound-enabled";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // приватный режим — настройка не переживёт перезагрузку, не критично
  }
}

/**
 * Короткий сигнал: две восходящие ноты на успех, одна низкая на ошибку.
 * Тихо выходит, если звук выключен или Web Audio недоступен.
 */
export function playChime(kind: "success" | "error" | "info") {
  if (kind === "info") return;
  if (!isSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // До первого жеста пользователя браузер держит контекст приостановленным.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const notes = kind === "error" ? [311.13] : [659.25, 987.77];
  const now = ctx.currentTime;

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const start = now + i * 0.11;
    const end = start + (kind === "error" ? 0.32 : 0.2);
    // Плавные фронты — иначе слышны щелчки на старте и обрыве.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}
