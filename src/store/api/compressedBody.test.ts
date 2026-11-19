import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it } from "vitest";

import { GZIP_TYPE, gzipJson, resetGzipSupport, sendCompressed } from "./compressedBody";

/** Распаковать то, что ушло бы на сервер. */
async function gunzipJson(blob: Blob): Promise<unknown> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/** Ответ сервера с ошибкой — как его отдаёт axios. */
function httpError(status: number, data: unknown = {}): AxiosError {
  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const graph = {
  name: "Фенол",
  nodes: Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, data: { label: `Продукт ${i}` } })),
  edges: [],
};

describe("сохранение графа сжатым", () => {
  beforeEach(() => resetGzipSupport());

  it("сжатое тело распаковывается в тот же граф и заметно меньше", async () => {
    const packed = await gzipJson(graph);
    expect(packed).not.toBeNull();
    expect(await gunzipJson(packed!)).toEqual(graph);
    expect(packed!.size).toBeLessThan(JSON.stringify(graph).length / 5);
  });

  it("новый сервер: одна отправка, сжатая, с Content-Type application/gzip", async () => {
    const sent: { body: unknown; type?: string }[] = [];
    const r = await sendCompressed(graph, async (body, type) => {
      sent.push({ body, type });
      return "ok";
    });
    expect(r).toBe("ok");
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(GZIP_TYPE);
    expect(await gunzipJson(sent[0].body as Blob)).toEqual(graph);
  });

  it("старый сервер (500 на сжатое): повтор несжатым, дальше сразу несжатым", async () => {
    const sent: (string | undefined)[] = [];
    const oldServer = async (_body: unknown, type?: string) => {
      sent.push(type);
      if (type === GZIP_TYPE) throw httpError(500, { error: "Cannot destructure property 'name' of 'req.body'" });
      return "ok";
    };
    expect(await sendCompressed(graph, oldServer)).toBe("ok");
    expect(sent).toEqual([GZIP_TYPE, undefined]);
    expect(await sendCompressed(graph, oldServer)).toBe("ok");
    expect(sent).toEqual([GZIP_TYPE, undefined, undefined]);
  });

  it("конфликт версий (409) и обрыв связи — не повторяются несжатым", async () => {
    let calls = 0;
    const conflict = httpError(409, { error: "conflict", current: { id: "g" } });
    await expect(
      sendCompressed(graph, async () => {
        calls++;
        throw conflict;
      }),
    ).rejects.toBe(conflict);
    expect(calls).toBe(1);

    const network = new AxiosError("Network Error", "ERR_NETWORK");
    await expect(
      sendCompressed(graph, async () => {
        calls++;
        throw network;
      }),
    ).rejects.toBe(network);
    expect(calls).toBe(2);
  });
});
