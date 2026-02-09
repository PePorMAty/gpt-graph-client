export function formatTechDescription(blocks: string[]): string {
  // Можно хранить как plain text (у тебя textarea)
  // Если хочешь — можно сделать “кликабельные ссылки” позже через markdown/renderer.
  return blocks.join("\n\n");
}
