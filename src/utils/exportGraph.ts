/** Безопасное имя файла из названия графа. */
function fileNameBase(name: string | null | undefined): string {
  const clean = (name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-");
  return clean || "graph";
}

function download(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Выгрузка графа в JSON — тот же формат, что у сохранения на сервер. */
export function exportGraphJson(payload: unknown, graphName?: string | null) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  download(url, `${fileNameBase(graphName)}.json`);
  // Освобождаем объектный URL после того, как браузер забрал файл.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
