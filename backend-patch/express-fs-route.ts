// Вариант 1: Express + TypeScript, файловое хранилище.
//
// Граф хранится как один JSON-файл `<dir>/<id>.json`. Перенести этот
// handler в файл с другими методами /graph-files (например,
// routes/graph-files.ts или controllers/graphFiles.ts), там скорее
// всего уже есть GRAPH_FILES_DIR / GRAPHS_DIR — переиспользовать его.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";

// TODO: использовать существующую константу из того же файла, где живут
// POST /save, GET /, GET /:id. Здесь — placeholder.
const GRAPH_FILES_DIR = process.env.GRAPH_FILES_DIR ?? "./graph-files";

// id должен быть безопасным: разрешены только буквы/цифры/-/_, чтобы
// исключить path traversal вроде "../something".
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export async function deleteGraphFile(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || !SAFE_ID.test(id)) {
    res.status(400).json({ success: false, error: "Невалидный id" });
    return;
  }

  const filePath = path.join(GRAPH_FILES_DIR, `${id}.json`);

  // Дополнительная защита: путь не должен выходить за пределы директории.
  const resolved = path.resolve(filePath);
  const root = path.resolve(GRAPH_FILES_DIR);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    res.status(400).json({ success: false, error: "Невалидный id" });
    return;
  }

  try {
    await fs.unlink(resolved);
    res.status(204).end();
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      res.status(404).json({ success: false, error: "Граф не найден" });
      return;
    }
    console.error("[deleteGraphFile] ", e);
    res.status(500).json({ success: false, error: "Не удалось удалить" });
  }
}

// Регистрация (в том же router, где другие методы /graph-files):
// router.delete("/:id", deleteGraphFile);
