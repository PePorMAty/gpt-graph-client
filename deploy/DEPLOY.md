# Сайт на своём домене: https://sorangptgraph.xyz

Приложение и API живут на одном домене:

| Адрес | Что там | Откуда |
|---|---|---|
| `https://sorangptgraph.xyz/` | приложение | `/var/www/sorangptgraph` — сборка клиента из ветки `develop` |
| `https://sorangptgraph.xyz/api/…` | API | сервер под pm2, через nginx — как и раньше |
| `/terms.html`, `/privacy.html` | пользовательское соглашение, политика конфиденциальности | `public/` клиента |
| `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` | для поисковиков и сканеров безопасности | `public/` клиента |

Сборка на GitHub Pages (`pepormaty.github.io/gpt-graph-client`) работает
по-прежнему: она собирается без `VITE_BASE` и живёт под `/gpt-graph-client/`.

## Выкладка — из `develop`

```
git -C ~/gpt-graph-client pull -q && bash ~/gpt-graph-client/deploy/deploy-site.sh
```

`pull` — чтобы и сам скрипт был свежим. Без аргумента скрипт берёт
`develop` с GitHub и собирает его в отдельной папке `~/site-develop`
(вторая рабочая папка того же репозитория). Рабочая копия
`~/gpt-graph-client` может стоять на любой ветке — скрипт её не трогает,
поэтому случайно собрать на сайт «не ту ветку» нельзя: другую ветку
выкладывают, только назвав её явно (ниже).

Порядок работы: доделали в своей ветке → слили в `develop` на GitHub →
запустили скрипт. В конце он печатает, какой коммит выложен, и проверяет,
что главная и API отвечают 200.

Если в страницах остались незаполненные заглушки `{{…}}`, скрипт сайт не
выкладывает и пишет, в каких файлах они.

### Другая ветка — проверить на домене до слияния

Скрипт соберёт и другую ветку, если назвать её явно. Свежий скрипт лежит
в самой ветке, поэтому рабочую копию сначала переключают на неё:

```
git -C ~/gpt-graph-client fetch -q origin claude/combined-testing
git -C ~/gpt-graph-client checkout -q claude/combined-testing && git -C ~/gpt-graph-client pull -q
bash ~/gpt-graph-client/deploy/deploy-site.sh claude/combined-testing
```

GitHub Pages остаётся на `develop`. Что сейчас на домене — в
`https://sorangptgraph.xyz/version.txt` (ветка и коммит; его же печатает
`e2e-site --site=prod`). Вернуть `develop` — скрипт без аргумента.

Откат на прежнюю версию (скрипт хранит её рядом):

```
mv /var/www/sorangptgraph /var/www/sorangptgraph.bad && mv /var/www/sorangptgraph.old /var/www/sorangptgraph
```

## Первая настройка (один раз)

1. **Почта `support@sorangptgraph.xyz`.** Этот адрес указан в соглашении,
   политике и `security.txt` — письма на него должны доходить. Нужна почта
   для домена (VK WorkSpace, Яндекс 360 и т. п.) или пересылка на личный
   ящик (например, ImprovMX): сервис скажет, какие записи MX и TXT (SPF)
   добавить в Reg.ru → управление зоной. Проверка — письмо на адрес с
   любого ящика.

   Владелец в документах назван «администрация сервиса «Граф производства»».
   По 152-ФЗ оператор персональных данных — конкретное лицо (ФИО, ИП или
   организация); когда сервис станет публичным, вписать его в
   `public/terms.html` (п. 1.1) и `public/privacy.html` (п. 1.2).
2. **Первая выкладка — до смены nginx.** На сервере нужна копия репозитория
   клиента — оттуда запускается скрипт. Сборка требует Node.js 20.19+ или
   22.12+ (`node -v`). Репозиторий публичный, ключи не нужны:
   ```
   git clone -b develop https://github.com/PePorMAty/gpt-graph-client.git ~/gpt-graph-client
   bash ~/gpt-graph-client/deploy/deploy-site.sh
   ```
   Сайт ляжет в `/var/www/sorangptgraph`, а nginx его пока не отдаёт — API
   работает как работал. Скрипт создаст `~/site-develop` с веткой `develop`:
   файлы для nginx на следующем шаге берутся оттуда.
3. **Конфиг nginx.** Рабочий конфиг лежит в репозитории —
   `deploy/nginx/sorangptgraph.xyz.conf`: прежний (API, CORS, сертификат,
   таймауты — без изменений) плюс сайт по корню, заголовки безопасности,
   кэш, сжатие, редиректы на https и на адрес без www. Сначала копия
   прежнего (при повторном запуске она не перезапишется), потом новые
   файлы и проверка:
   ```
   [ -e /root/sorangptgraph.xyz.nginx-before-site ] || cp /etc/nginx/sites-available/sorangptgraph.xyz /root/sorangptgraph.xyz.nginx-before-site
   mkdir -p /etc/nginx/snippets
   cp ~/site-develop/deploy/nginx/security-headers.conf /etc/nginx/snippets/
   cp ~/site-develop/deploy/nginx/sorangptgraph.xyz.conf /etc/nginx/sites-available/sorangptgraph.xyz
   nginx -t && systemctl reload nginx
   ```
   Если `nginx -t` ругается, `reload` не выполнится и сайт продолжит работать
   на прежнем конфиге; вернуть файл на место:
   ```
   cp /root/sorangptgraph.xyz.nginx-before-site /etc/nginx/sites-available/sorangptgraph.xyz && nginx -t && systemctl reload nginx
   ```
   Конфиг меняется так же: правка в репозитории → `develop` → те же `cp`,
   `nginx -t`, `reload`. Если новые заголовки рассчитаны на новую сборку
   (например, политика CSP стала строже), сначала выкладка сайта, потом
   `cp` заголовков: иначе старая сборка какое-то время работает под новой
   политикой. Остальные конфиги (`graph-server`, `hello`) не
   затрагиваются.
4. **Проверка на сервере:**
   ```
   curl -s --resolve sorangptgraph.xyz:443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://sorangptgraph.xyz/api/industry/status
   curl -sI --resolve sorangptgraph.xyz:443:127.0.0.1 https://sorangptgraph.xyz/ | grep -iE '^(HTTP|strict-transport|content-security)'
   certbot certificates
   certbot renew --dry-run
   ```
   `--resolve … 127.0.0.1` — запрос идёт в nginx этой же машины: с сервера
   на собственный внешний адрес curl не достучится (покажет 000), хотя
   снаружи сайт работает. Снаружи проверять браузером.

   Первая — API отвечает 200; вторая — сайт и заголовки безопасности;
   третья — есть ли `www.sorangptgraph.xyz` в списке `Domains` сертификата
   (без него адрес с www откроется с ошибкой сертификата); четвёртая —
   продление сертификата работает с новым конфигом.

## Проверки после выкладки

- **Сертификат и шифрование:** https://www.ssllabs.com/ssltest/analyze.html?d=sorangptgraph.xyz
- **Заголовки безопасности:** https://securityheaders.com/?q=sorangptgraph.xyz
- **Общая проверка:** https://developer.mozilla.org/en-US/observatory/analyze?host=sorangptgraph.xyz
- **Поисковики.** Подтвердить права на сайт в
  [Яндекс.Вебмастере](https://webmaster.yandex.ru) и
  [Google Search Console](https://search.google.com/search-console) — проще
  всего TXT-записью в DNS (Reg.ru → управление зоной → добавить запись), —
  и отправить там `https://sorangptgraph.xyz/sitemap.xml`.

## Что обещано в документах — и должно быть правдой

- **Журналы nginx хранятся не дольше 30 дней** (политика, п. 6). На сервере
  было `daily` + `rotate 52` (52 дня); нужно `rotate 29` — сегодняшний файл
  и 29 архивных:
  ```
  sed -i -E 's/^(\s*)rotate [0-9]+$/\1rotate 29/' /etc/logrotate.d/nginx
  grep -E "daily|weekly|rotate" /etc/logrotate.d/nginx
  ```
  Лишние архивы logrotate удалит сам при ближайшей ежедневной ротации.
- **Поставщики моделей** — OpenAI и Alibaba Cloud (DashScope) (политика,
  п. 5). Появится новый — дописать в политику.
- **Шрифты с Google Fonts** (политика, п. 5.2). Если перенести шрифт Inter на
  свой сервер, этот пункт и адреса Google в CSP можно убрать.
- **Срок `Expires` в `security.txt`** — 14.10.2027; до него обновить.
