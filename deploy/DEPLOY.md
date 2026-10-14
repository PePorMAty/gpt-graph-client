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

1. **Реквизиты в документах.** В `public/terms.html`, `public/privacy.html`
   и `public/.well-known/security.txt` заменить `{{ВЛАДЕЛЕЦ}}` (ФИО, ИП или
   организация) и `{{EMAIL}}` (адрес для обращений). Слить в `develop`.
2. **Заголовки безопасности.** Скопировать сниппет:
   ```
   cp ~/gpt-graph-client/deploy/nginx/security-headers.conf /etc/nginx/snippets/
   ```
3. **Конфиг nginx.** Дополнить нынешний конфиг домена по образцу
   `deploy/nginx/sorangptgraph.conf.example`: сайт по корню, кэш, сжатие,
   редиректы. Блок `location /api/` и строки сертификата остаются как есть.
   Перед правкой — копия, после — проверка:
   ```
   cp -a /etc/nginx/sites-available /root/nginx-sites-backup-$(date +%F)
   nginx -t && systemctl reload nginx
   ```
4. **Первая выкладка:** `bash ~/gpt-graph-client/deploy/deploy-site.sh`.

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
