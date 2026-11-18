// Сохранение графа — сжатым телом (gzip).
//
// Сайт отдаёт граф браузеру сжатым (1,6 МБ → 116 КБ), а сохранять его
// клиент отправлял как есть: 1,6 МБ, большой граф — 8,6 МБ. На медленном
// канале такое сохранение шло десятки секунд и обрывалось
// (ERR_HTTP2_PROTOCOL_ERROR, 18.11). Сжатое — в 10–15 раз меньше.
//
// Сжатие помечается через Content-Type: application/gzip, а не
// Content-Encoding: CORS для сайта на GitHub Pages настраивает nginx сервера,
// и заголовок Content-Encoding он не пропускает, а Content-Type — пропускает.
//
// Сервер старее клиента (до выкладки) сжатое тело не понимает и отвечает
// ошибкой, ничего не записав, — тогда повторяем как раньше, несжатым, и до
// перезагрузки страницы больше не сжимаем.

import axios from "axios";

export const GZIP_TYPE = "application/gzip";

let serverRefusedGzip = false;

/** Для тестов: забыть, что сервер не понял сжатое. */
export function resetGzipSupport(): void {
  serverRefusedGzip = false;
}

/** JSON → gzip. null — сжать нечем (старый браузер) или не вышло: шлём как есть. */
export async function gzipJson(value: unknown): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([JSON.stringify(value)])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/**
 * Сервер не разобрал сжатое тело: старый ответит 500 («нельзя разобрать
 * req.body») или 400/415. Конфликт версий (409) и обрыв связи — не про
 * сжатие: их не повторяем.
 */
function refusedGzip(e: unknown): boolean {
  if (!axios.isAxiosError(e) || !e.response) return false;
  return [400, 413, 415, 500].includes(e.response.status);
}

/**
 * Отправить payload сжатым через send(body, contentType); если сервер его не
 * понял — повторить несжатым (send(payload)) и запомнить это.
 */
export async function sendCompressed<T>(
  payload: unknown,
  send: (body: unknown, contentType?: string) => Promise<T>,
): Promise<T> {
  const packed = serverRefusedGzip ? null : await gzipJson(payload);
  if (packed) {
    try {
      return await send(packed, GZIP_TYPE);
    } catch (e) {
      if (!refusedGzip(e)) throw e;
      try {
        const plain = await send(payload);
        serverRefusedGzip = true;
        return plain;
      } catch (e2) {
        // Несжатое сервер разобрал и ответил по делу (например, 409 —
        // конфликт версий): значит, не понял он именно сжатое.
        if (axios.isAxiosError(e2) && e2.response && !refusedGzip(e2)) serverRefusedGzip = true;
        throw e2;
      }
    }
  }
  return send(payload);
}
