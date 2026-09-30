/**
 * Причина отказа, которую назвал сервер.
 *
 * Долгие маршруты отвечают 200 ещё до ответа модели — держат соединение
 * пробелами, — поэтому об отказе говорит success: false в теле, а причина
 * лежит в поле error: строкой или объектом с message. Пустая строка — сервер
 * причину не назвал.
 */
export function serverReason(data: unknown): string {
  const err = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof err === "string") return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg.trim();
  }
  return "";
}
