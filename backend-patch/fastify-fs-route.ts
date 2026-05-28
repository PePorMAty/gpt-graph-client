// Вариант 4: Fastify + TypeScript, файловое хранилище.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const GRAPH_FILES_DIR = process.env.GRAPH_FILES_DIR ?? "./graph-files";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

interface Params {
  id: string;
}

export default async function registerDeleteGraphFile(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.delete<{ Params: Params }>(
    "/graph-files/:id",
    async (req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
      const { id } = req.params;
      if (!id || !SAFE_ID.test(id)) {
        return reply
          .code(400)
          .send({ success: false, error: "Невалидный id" });
      }

      const resolved = path.resolve(GRAPH_FILES_DIR, `${id}.json`);
      const root = path.resolve(GRAPH_FILES_DIR);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return reply
          .code(400)
          .send({ success: false, error: "Невалидный id" });
      }

      try {
        await fs.unlink(resolved);
        return reply.code(204).send();
      } catch (e: unknown) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
          return reply
            .code(404)
            .send({ success: false, error: "Граф не найден" });
        }
        fastify.log.error(e, "deleteGraphFile failed");
        return reply
          .code(500)
          .send({ success: false, error: "Не удалось удалить" });
      }
    },
  );
}

// Регистрация (в bootstrap):
// import registerDeleteGraphFile from "./routes/graph-files-delete";
// await fastify.register(registerDeleteGraphFile);
