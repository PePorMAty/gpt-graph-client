// Звук уведомлений синтезируется через Web Audio: не тянем аудиофайл и не
// зависим от сети — короткий тон генерируется на месте.

const SOUND_KEY = "toast-sound-enabled";
const VOLUME_KEY = "toast-sound-volume";

// Пиковая громкость сигнала при 100%: подобрана на слух, выше начинает резать.
const PEAK_GAIN = 0.18;

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

/** Громкость звука уведомлений: 0..1 (1 — как раньше, по умолчанию). */
export function getSoundVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 1;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

export function setSoundVolume(volume: number) {
  try {
    localStorage.setItem(
      VOLUME_KEY,
      String(Math.min(1, Math.max(0, volume))),
    );
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

  const volume = getSoundVolume();
  if (volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // До первого жеста пользователя браузер держит контекст приостановленным.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const notes = kind === "error" ? [311.13] : [659.25, 987.77];
  const now = ctx.currentTime;
  // exponentialRamp не принимает 0 — держим маленький ненулевой минимум.
  const peak = Math.max(PEAK_GAIN * volume, 0.0002);

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const start = now + i * 0.11;
    const end = start + (kind === "error" ? 0.32 : 0.2);
    // Плавные фронты — иначе слышны щелчки на старте и обрыве.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}
