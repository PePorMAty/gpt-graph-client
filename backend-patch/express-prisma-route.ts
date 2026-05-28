// Вариант 3: Express + TypeScript, реляционная БД через Prisma.

import type { Request, Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";

// TODO: использовать singleton-экземпляр PrismaClient, который уже
// создан в проекте. Здесь — placeholder.
const prisma = new PrismaClient();

export async function deleteGraphFile(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: "Невалидный id" });
    return;
  }

  try {
    await prisma.graphFile.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    // P2025 — Record to delete does not exist
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      res.status(404).json({ success: false, error: "Граф не найден" });
      return;
    }
    console.error("[deleteGraphFile] ", e);
    res.status(500).json({ success: false, error: "Не удалось удалить" });
  }
}

// Регистрация:
// router.delete("/:id", deleteGraphFile);
