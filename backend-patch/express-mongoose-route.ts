// Вариант 2: Express + TypeScript, MongoDB через Mongoose.

import type { Request, Response } from "express";
import mongoose from "mongoose";

// TODO: импортировать существующую модель GraphFile из своего проекта.
// Здесь — placeholder.
import { GraphFile } from "../models/GraphFile";

export async function deleteGraphFile(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: "Невалидный id" });
    return;
  }

  try {
    const deleted = await GraphFile.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Граф не найден" });
      return;
    }
    res.status(204).end();
  } catch (e) {
    console.error("[deleteGraphFile] ", e);
    res.status(500).json({ success: false, error: "Не удалось удалить" });
  }
}

// Регистрация:
// router.delete("/:id", deleteGraphFile);
