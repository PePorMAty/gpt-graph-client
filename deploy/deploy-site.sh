#!/usr/bin/env bash
#
# Выложить сайт https://sorangptgraph.xyz из ветки develop — и только из неё.
#
#   bash ~/gpt-graph-client/deploy/deploy-site.sh
#
# Рабочая копия ~/gpt-graph-client может стоять на любой ветке: скрипт её не
# трогает. Сборка идёт в отдельной папке ~/site-develop — это вторая рабочая
# папка того же репозитория (git worktree), и в ней всегда свежий develop с
# GitHub. Ветка зашита в скрипт: собрать им что-то, кроме develop, нельзя.
#
# По шагам:
#   1) забрать develop с GitHub и поставить его в ~/site-develop;
#   2) собрать: приложение по корню домена, API — https://sorangptgraph.xyz/api;
#   3) проверить, что в страницах нет незаполненных заглушек {{…}};
#   4) положить сборку в /var/www/sorangptgraph (оттуда её отдаёт nginx), а
#      прежнюю версию сохранить рядом — в /var/www/sorangptgraph.old.
#
# Откатиться на прежнюю версию:
#   mv /var/www/sorangptgraph /var/www/sorangptgraph.bad && mv /var/www/sorangptgraph.old /var/www/sorangptgraph

set -euo pipefail

BRANCH="develop"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HOME/site-develop"
DEST="/var/www/sorangptgraph"
API_URL="https://sorangptgraph.xyz/api"

step() { printf '\n── %s\n' "$*"; }

step "Забираю $BRANCH с GitHub"
git -C "$REPO" fetch --quiet origin "$BRANCH"

if [ ! -e "$SRC/.git" ]; then
  step "Создаю отдельную папку для сборки: $SRC"
  git -C "$REPO" worktree prune
  git -C "$REPO" worktree add --quiet --detach "$SRC" "origin/$BRANCH"
else
  git -C "$SRC" checkout --quiet --detach --force "origin/$BRANCH"
fi
# Всё, что не из репозитория, — прочь, кроме зависимостей: их ставить долго.
git -C "$SRC" clean --quiet -fdx -e node_modules
COMMIT="$(git -C "$SRC" log -1 --format='%h %ad %s' --date=short)"
echo "Выкладываю: $COMMIT"

# Зависимости ставим, только если поменялся package-lock.json.
LOCK_HASH="$(sha256sum "$SRC/package-lock.json" | cut -d' ' -f1)"
if [ "$(cat "$SRC/node_modules/.lock-hash" 2>/dev/null)" != "$LOCK_HASH" ]; then
  step "Ставлю зависимости (package-lock.json изменился)"
  (cd "$SRC" && npm ci --no-audit --no-fund)
  echo "$LOCK_HASH" > "$SRC/node_modules/.lock-hash"
fi

step "Собираю"
# Сборщику — не больше 768 МБ: на сервере 2 ГБ, рядом работают API и VPN.
# Без лимита Node берёт память с запасом (до 1,1 ГБ), с лимитом сборка
# укладывается примерно в 0,9 ГБ; 512 МБ ей уже мало. Если однажды не
# хватит и этого, сборка остановится с «heap out of memory», а сайт
# останется прежним.
(cd "$SRC" && NODE_OPTIONS=--max-old-space-size=768 VITE_BASE=/ VITE_API_URL="$API_URL" npm run build)

step "Проверяю заглушки {{…}}"
LEFT="$(grep -rlE '\{\{[^}]+\}\}' "$SRC/dist" --include='*.html' --include='*.txt' || true)"
if [ -n "$LEFT" ]; then
  echo "В сборке остались незаполненные заглушки — сайт НЕ выложен:"
  echo "$LEFT" | sed "s|$SRC/dist/|  |"
  echo "Заполните их в ветке develop (обычно это public/terms.html, public/privacy.html, public/.well-known/security.txt)."
  exit 1
fi

step "Кладу сборку в $DEST"
rm -rf "$DEST.new"
cp -a "$SRC/dist" "$DEST.new"
chmod -R a+rX "$DEST.new"
if [ -d "$DEST" ]; then
  rm -rf "$DEST.old"
  mv "$DEST" "$DEST.old"
fi
mv "$DEST.new" "$DEST"

step "Готово"
echo "На сайте: $COMMIT"
# Проверяем через nginx этой же машины (127.0.0.1): запрос с сервера на свой
# же внешний адрес у многих хостингов не проходит — curl показал бы 000,
# хотя снаружи сайт открывается.
LOCAL=(-s --max-time 20 --resolve sorangptgraph.xyz:443:127.0.0.1)
if curl "${LOCAL[@]}" https://sorangptgraph.xyz/ | cmp -s - "$DEST/index.html"; then
  SITE="отдаёт эту сборку"
else
  SITE="отдаёт НЕ эту сборку (nginx ещё не настроен на $DEST?)"
fi
API="$(curl "${LOCAL[@]}" -o /dev/null -w '%{http_code}' https://sorangptgraph.xyz/api/industry/status || true)"
echo "Проверка через nginx на сервере: главная $SITE; API — $API (должно быть 200)"
