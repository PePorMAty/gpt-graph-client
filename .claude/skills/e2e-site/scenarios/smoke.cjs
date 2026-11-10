// Быстрая проверка, что приложение вообще живо: 10–20 секунд.
module.exports = {
  description: "Приложение открывается, библиотека показывает графы",
  async run({ page, origin, lib, check, shot }) {
    await lib.openApp(page, origin);
    check("приложение открылось", await page.getByRole("link", { name: "Граф", exact: true }).count() > 0);
    await page.getByRole("link", { name: "Библиотека" }).click();
    const rows = page.getByText(/^Обновлён/);
    await rows.first().waitFor({ timeout: 30000 }).catch(() => {});
    const n = await rows.count();
    check("библиотека показывает графы", n > 0, `${n} шт.`);
    await shot("library");
  },
};
