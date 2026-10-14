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

## Выкладка — только из `develop`

```
bash ~/gpt-graph-client/deploy/deploy-site.sh
```

Скрипт берёт **только** `develop` с GitHub и собирает его в отдельной папке
`~/site-develop` (вторая рабочая папка того же репозитория). Рабочая копия
`~/gpt-graph-client` может стоять на любой ветке — скрипт её не трогает,
поэтому собрать на сайт «не ту ветку» нельзя.

Порядок работы: доделали в своей ветке → слили в `develop` на GitHub →
запустили скрипт. В конце он печатает, какой коммит выложен, и проверяет,
что главная и API отвечают 200.

Если в страницах остались незаполненные заглушки `{{…}}`, скрипт сайт не
выкладывает и пишет, в каких файлах они.

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
2. **Первая выкладка — до смены nginx.** Скрипт должен быть в рабочей
   копии: если `ls ~/gpt-graph-client/deploy/deploy-site.sh` его не находит,
   обновите её (`git pull`). Затем:
   ```
   bash ~/gpt-graph-client/deploy/deploy-site.sh
   ```
   Сайт ляжет в `/var/www/sorangptgraph`, а nginx его пока не отдаёт — API
   работает как работал. Скрипт создаст `~/site-develop` с веткой `develop`:
   файлы для nginx на следующем шаге берутся оттуда.
3. **Конфиг nginx.** Рабочий конфиг лежит в репозитории —
   `deploy/nginx/sorangptgraph.xyz.conf`: прежний (API, CORS, сертификат,
   таймауты — без изменений) плюс сайт по корню, заголовки безопасности,
   кэш, сжатие, редиректы на https и на адрес без www. Сначала копия
   прежнего (`cp -n` не перезапишет её при повторном запуске), потом новые
   файлы и проверка:
   ```
   cp -n /etc/nginx/sites-available/sorangptgraph.xyz /root/sorangptgraph.xyz.nginx-before-site
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
   `nginx -t`, `reload`. Остальные конфиги (`graph-server`, `hello`) не
   затрагиваются.
4. **Проверка на сервере:**
   ```
   curl -s -o /dev/null -w '%{http_code}\n' https://sorangptgraph.xyz/api/industry/status
   curl -sI https://sorangptgraph.xyz/ | grep -iE '^(HTTP|strict-transport|content-security)'
   certbot certificates
   certbot renew --dry-run
   ```
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

- **Журналы nginx хранятся не дольше 30 дней** (политика, п. 6). На Ubuntu
  по умолчанию — 14 дней: `grep -E "daily|weekly|rotate" /etc/logrotate.d/nginx`.
- **Поставщики моделей** — OpenAI и Alibaba Cloud (DashScope) (политика,
  п. 5). Появится новый — дописать в политику.
- **Шрифты с Google Fonts** (политика, п. 5.2). Если перенести шрифт Inter на
  свой сервер, этот пункт и адреса Google в CSP можно убрать.
- **Срок `Expires` в `security.txt`** — 14.10.2027; до него обновить.
