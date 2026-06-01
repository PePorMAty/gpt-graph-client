// Патч для routes/graph-files.js — добавляет DELETE /:id.
//
// Контекст: id в этом сервере — имя файла целиком (например,
// `graph-1_2024-...-z.json`), хранение в `<repo>/data/saved-graphs/`.
// Логика повторяет паттерн уже существующего `GET /:id`: тот же
// `path.basename` для защиты от path traversal, тот же `path.join`.
//
// Вставить ЭТОТ блок в `routes/graph-files.js` сразу после
// `router.get("/:id", ...)` и перед `module.exports = router;`.

router.delete("/:id", async (req, res) => {
  try {
    const fileName = path.basename(req.params.id);
    const filePath = path.join(GRAPH_DIR, fileName);

    await fs.unlink(filePath);
    res.status(204).end();
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return res.status(404).json({ error: "Graph not found" });
    }
    console.error("Delete graph error:", e);
    res.status(500).json({ error: "Failed to delete graph" });
  }
});
